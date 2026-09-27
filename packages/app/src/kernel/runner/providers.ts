import { randomUUID } from "node:crypto";
import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { Format } from "../pipeline.js";
import type { GeneratedImage, GeneratedVideo } from "../ports/image.js";
import type { LlmEvent, LlmImage, Message, ThinkingConfig, Usage } from "../ports/llm.js";
import type { LlmDocument } from "../ports/llm-documents.js";
import { isProviderError, providerError } from "../ports/model.js";
import { type PlanLimitReading, planAccountOf } from "../ports/plan-limits.js";
import type { Registry } from "../ports/registry.js";
import type { AttemptContext } from "./attempt.js";
import { attempt } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";
import type { StageContext } from "./index.js";
import type { LimitGate, MeteredCall, UsageMeter } from "./meter.js";
import type { ProviderQueue } from "./queue.js";
import type { AttemptResult } from "./work.js";

// What a stage slice is handed instead of a port. Every method is already inside the
// attempt wrapper and none hands back an adapter, so a slice cannot reach a provider
// except through the retry policy; the linter forbids `slices/**` importing `adapters/**`.

export interface LlmAnswer {
  readonly text: string;
  readonly usage: Usage | null;
  readonly finishReason: string | null;
}

export interface LlmCall {
  readonly documents?: readonly LlmDocument[] | undefined;
  readonly thinkingConfig?: ThinkingConfig | null | undefined;
  readonly thinking?: import("../ports/llm.js").ThinkingMode | undefined;
  readonly provider: string;
  readonly model: string;
  readonly messages: readonly Message[];
  readonly previewLabel?: string | undefined;
  readonly webSearch?: boolean | undefined;
  readonly images?: readonly LlmImage[] | undefined;
  // An answer that arrived but is unusable counts as a failed attempt, so the check runs inside
  // the wrapper. It returns the sentence the stage would show rather than throwing, so a slice
  // never names a failure.
  readonly check?: ((answer: LlmAnswer) => string | undefined) | undefined;
}

export interface TtsCall {
  readonly model?: string | undefined;
  readonly provider: string;
  readonly voiceId: string;
  readonly text: string;
  readonly dialogue?: readonly import("../ports/tts.js").DialogueLine[] | undefined;
}

export type TtsStreamEvent =
  | { readonly type: "start" | "complete" | "interrupted" }
  | { readonly type: "chunk"; readonly bytes: Uint8Array };
export type ObserveTts = (event: TtsStreamEvent) => void;

export interface NarratedAudio {
  readonly bytes: Uint8Array;
  readonly container: "mp3";
}

export interface ImageCall {
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly aspect: Format;
  readonly thinking?: import("../ports/llm.js").ThinkingMode | undefined;
  // The establishing image the picture is drawn with as its visual reference.
  readonly reference?: GeneratedImage | undefined;
  // The cast members the brief mentions, with their pictures.
  readonly cast?: readonly import("../ports/image.js").CastReference[] | undefined;
  // What the live panel calls this image while a long job reports its progress.
  readonly previewLabel?: string | undefined;
}

export interface AnimateCall {
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly image: GeneratedImage;
  readonly aspect: Format;
  readonly seconds: number;
}

export interface StageProviders {
  // `onEvent` sees the deltas of the attempt in flight. A retry starts the
  // answer again; the text returned is only ever the successful attempt's.
  readonly llm: (
    call: LlmCall,
    onEvent?: (event: LlmEvent) => void,
  ) => Promise<AttemptResult<LlmAnswer>>;
  // Durable narration keeps only a successful complete attempt. The optional
  // observer copies preview bytes and resets on every retry.
  readonly tts: (call: TtsCall, observe?: ObserveTts) => Promise<AttemptResult<NarratedAudio>>;
  readonly image: (call: ImageCall) => Promise<AttemptResult<GeneratedImage>>;
  // Optional so a stage that never animates can be handed a fake without it.
  readonly animate?: ((call: AnimateCall) => Promise<AttemptResult<GeneratedVideo>>) | undefined;
  // The same calls, recorded against one resumable piece.
  readonly forPiece: (pieceId: string) => StageProviders;
}

export interface ProviderDeps {
  readonly queue?: ProviderQueue;
  readonly registry: Registry;
  readonly attempts: AttemptStore;
  readonly clock: Clock;
  readonly log: Log;
  // Records what each successful call used; absent, nothing is recorded.
  readonly meter?: UsageMeter | undefined;
  // Holds a CLI's calls while its plan allowance is used up; absent, a used-up plan fails
  // the call like any other terminal error.
  readonly limits?: LimitGate | undefined;
}

export function stageProviders(
  deps: ProviderDeps,
  context: StageContext,
  pieceId?: string,
): StageProviders {
  const ctx: AttemptContext = {
    work: context.work,
    maySubmit: () => context.maySubmit(pieceId),
    ...(pieceId === undefined ? {} : { workPieceId: pieceId }),
    clock: deps.clock,
    log: deps.log,
    attempts: deps.attempts,
    projectId: context.stage.projectId,
    stage: context.stage.kind,
    stageId: context.stage.id,
    ...(pieceId === undefined ? {} : { pieceId }),
    signal: context.signal,
  };

  const queued = <T>(provider: string, work: () => Promise<T>): Promise<T> =>
    deps.queue ? deps.queue.run(provider, context.signal, work) : work();
  const waiter = { projectId: context.stage.projectId, stage: context.stage.kind };
  // A CLI whose plan allowance is used up is waited for here, outside the queue, so the wait
  // holds no provider slot; the call is then made afresh with a full set of attempts.
  const schedule = async <T>(provider: string, work: () => Promise<T>): Promise<T> => {
    const account = planAccountOf(provider);
    const gate = deps.limits;
    if (account === undefined || gate === undefined) return queued(provider, work);
    for (;;) {
      await gate.ready(account, waiter, context.signal);
      try {
        return await queued(provider, work);
      } catch (error) {
        const hit = isProviderError(error) ? error.fault.planLimit : undefined;
        if (hit === undefined || context.signal.aborted) throw error;
        gate.exhausted(hit);
      }
    }
  };
  // Metering never fails a call: the answer is already paid for.
  const meter = (call: Omit<MeteredCall, "projectId" | "stage">): void => {
    if (deps.meter === undefined) return;
    try {
      deps.meter.record({ ...call, projectId: context.stage.projectId, stage: context.stage.kind });
    } catch (error) {
      deps.log.write("warn", "usage.record", {
        projectId: context.stage.projectId,
        stage: context.stage.kind,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };
  const since = (started: number): number => Math.max(0, deps.clock.now().getTime() - started);
  return {
    llm: (
      call: LlmCall,
      onEvent?: (event: LlmEvent) => void,
    ): Promise<AttemptResult<LlmAnswer>> => {
      // Resolved once; the adapter reads the stored key per request, so a key replaced
      // mid-run still reaches the next attempt.
      const port = deps.registry.llm(call.provider);
      const callId = randomUUID();
      const preview = (text: string, reset?: boolean): void =>
        context.emit({
          type: "llm.preview",
          ...(pieceId === undefined ? {} : { workPieceId: pieceId }),
          projectId: context.stage.projectId,
          stage: context.stage.kind,
          callId,
          label: call.previewLabel ?? context.stage.kind,
          text,
          ...(reset === undefined ? {} : { reset }),
        });
      const started = deps.clock.now().getTime();
      let limits: PlanLimitReading | undefined;
      const answered = schedule(call.provider, () =>
        attempt(
          ctx,
          async (signal: AbortSignal, progress: () => void): Promise<LlmAnswer> => {
            preview("", true);
            let text = "";
            // Typed-ahead text the panel shows past the committed answer; the next delta
            // replaces it, so the panel never shows a sentence twice.
            let typed = false;
            let usage: Usage | null = null;
            let finishReason: string | null = null;
            limits = undefined;
            for await (const event of port.complete({
              model: call.model,
              ...(call.thinkingConfig === undefined ? {} : { thinkingConfig: call.thinkingConfig }),
              ...(call.thinking === undefined ? {} : { thinking: call.thinking }),
              messages: call.messages,
              ...(call.documents === undefined ? {} : { documents: call.documents }),
              ...(call.webSearch === undefined ? {} : { webSearch: call.webSearch }),
              ...(call.images === undefined ? {} : { images: call.images }),
              signal,
            })) {
              signal.throwIfAborted();
              // Every event is a sign of life, so the idle clock restarts here.
              progress();
              if (event.type === "delta") {
                text += event.text;
                if (typed) preview(text, true);
                else preview(event.text);
                typed = false;
              } else if (event.type === "partial") {
                typed = true;
                preview(event.text);
              } else if (event.type === "done") {
                usage = event.usage;
                finishReason = event.finishReason;
                limits = event.limits;
              }
              if (event.type === "delta" || event.type === "done") onEvent?.(event);
            }
            const answer: LlmAnswer = { text, usage, finishReason };
            const unusable = call.check?.(answer);
            if (unusable !== undefined) {
              // Thrown bare: the wrapper names it `other` and retries it like any bad answer.
              throw new Error(unusable);
            }
            return answer;
          },
          { kind: "llm", streaming: port.capabilities.streams },
        ),
      );
      return answered.then((result) => {
        if (result.ok) {
          const usage = result.value.usage;
          meter({
            kind: "llm",
            provider: call.provider,
            model: usage?.model ?? call.model,
            ...(usage === null
              ? {}
              : {
                  tokensIn: usage.inputTokens,
                  tokensOut: usage.outputTokens,
                  ...(usage.cachedInputTokens === undefined
                    ? {}
                    : { cachedTokens: usage.cachedInputTokens }),
                }),
            wallMs: since(started),
            ...(limits === undefined ? {} : { limits }),
          });
        }
        return result;
      });
    },

    tts: (call: TtsCall, observe?: ObserveTts): Promise<AttemptResult<NarratedAudio>> => {
      const port = deps.registry.tts(call.provider);
      let transientContinuation: string | undefined;
      const continuation = {
        read: (): string | undefined =>
          pieceId === undefined
            ? transientContinuation
            : (deps.attempts.readContinuation?.(context.work, pieceId) ?? transientContinuation),
        write: (token: string): void => {
          if (pieceId !== undefined)
            deps.attempts.writeContinuation?.(context.work, pieceId, token);
          transientContinuation = token;
        },
      };
      const notify = (event: TtsStreamEvent): void => {
        try {
          observe?.(event);
        } catch {
          // A preview is optional. A broken observer must never repeat a paid call.
          deps.log.write("warn", "audio.preview", {
            projectId: context.stage.projectId,
            stage: "audio",
            detail: "Could not update the live audio preview",
          });
        }
      };
      const started = deps.clock.now().getTime();
      const spoken = schedule(call.provider, () =>
        attempt(
          { ...ctx, continuation },
          async (signal: AbortSignal, progress: () => void): Promise<NarratedAudio> => {
            notify({ type: "start" });
            try {
              if (call.dialogue !== undefined && port.capabilities.dialogue !== true)
                throw providerError({
                  kind: "unsupported",
                  message: `${call.provider} can't speak several voices in one request. Turn off Native multi-speaker under Speakers (Play → Narration, or Edit project → Providers), then Try again.`,
                });
              const spoken = await port.synthesize({
                model: call.model,

                voiceId: call.voiceId,
                text: call.text,
                ...(call.dialogue === undefined ? {} : { dialogue: call.dialogue }),
                signal,
                onActivity: progress,
                continuation,
              });
              const reader = spoken.audio.getReader();
              const chunks: Uint8Array[] = [];
              let total = 0;
              try {
                for (;;) {
                  const { done, value } = await reader.read();
                  signal.throwIfAborted();
                  if (done || value === undefined) break;
                  progress();
                  chunks.push(value);
                  total += value.length;
                  notify({ type: "chunk", bytes: value });
                }
              } finally {
                reader.releaseLock();
              }
              const bytes = new Uint8Array(total);
              let at = 0;
              for (const chunk of chunks) {
                bytes.set(chunk, at);
                at += chunk.length;
              }
              notify({ type: "complete" });
              return { bytes, container: spoken.container };
            } catch (error) {
              notify({ type: "interrupted" });
              throw error;
            }
          },
          { kind: "tts", streaming: port.capabilities.streams },
        ),
      );
      return spoken.then((result) => {
        // Narration is billed by the characters sent, which is the text of this call.
        if (result.ok)
          meter({
            kind: "tts",
            provider: call.provider,
            model: call.model ?? "",
            characters: call.text.length,
            wallMs: since(started),
          });
        return result;
      });
    },

    image: (call: ImageCall): Promise<AttemptResult<GeneratedImage>> => {
      const port = deps.registry.image(call.provider);
      const callId = randomUUID();
      // A long job (the Codex CLI reviewing and redrawing its image) says how far it has got
      // on the stage's live panel; the other providers report nothing and show no panel.
      const onProgress = (text: string): void =>
        context.emit({
          type: "llm.preview",
          ...(pieceId === undefined ? {} : { workPieceId: pieceId }),
          projectId: context.stage.projectId,
          stage: context.stage.kind,
          callId,
          label: call.previewLabel ?? "Image",
          text,
          reset: true,
        });
      const started = deps.clock.now().getTime();
      const drawn = schedule(call.provider, () =>
        attempt(
          ctx,
          (signal: AbortSignal): Promise<GeneratedImage> =>
            port.generate({
              model: call.model,
              prompt: call.prompt,
              aspect: call.aspect,
              ...(call.thinking === undefined ? {} : { thinking: call.thinking }),
              ...(call.reference === undefined ? {} : { reference: call.reference }),
              ...(call.cast === undefined ? {} : { cast: call.cast }),
              onProgress,
              signal,
            }),
          // One request, one answer: the limit runs over the whole call - 300 s, or the
          // provider's own when it needs longer.
          {
            kind: "image",
            ...(port.timeoutMs === undefined ? {} : { timeoutMs: port.timeoutMs }),
          },
        ),
      );
      return drawn.then((result) => {
        if (result.ok) {
          const { usage, limits } = result.value;
          meter({
            kind: "image",
            provider: call.provider,
            model: call.model,
            images: 1,
            size: call.aspect,
            ...(call.thinking === undefined ? {} : { quality: call.thinking }),
            ...(usage === undefined
              ? {}
              : {
                  tokensIn: usage.inputTokens,
                  tokensOut: usage.outputTokens,
                  ...(usage.cachedInputTokens === undefined
                    ? {}
                    : { cachedTokens: usage.cachedInputTokens }),
                }),
            wallMs: since(started),
            ...(limits === undefined ? {} : { limits }),
          });
        }
        return result;
      });
    },

    animate: (call: AnimateCall): Promise<AttemptResult<GeneratedVideo>> => {
      const port = deps.registry.image(call.provider);
      const animate = port.animate;
      if (animate === undefined)
        return Promise.reject(
          providerError({
            kind: "unsupported",
            message: `${call.provider} can't turn images into video clips. Choose fal.ai or Replicate as the image provider in Edit project → Providers, or turn Animate images off in Edit project → Inputs → Look.`,
          }),
        );
      const started = deps.clock.now().getTime();
      const animated = schedule(call.provider, () =>
        attempt(
          ctx,
          (signal: AbortSignal): Promise<GeneratedVideo> =>
            animate({
              model: call.model,
              prompt: call.prompt,
              image: call.image,
              aspect: call.aspect,
              seconds: call.seconds,
              signal,
            }),
          // Queued and slow: the 900 s runs over the whole call, polling included.
          { kind: "video" },
        ),
      );
      return animated.then((result) => {
        if (result.ok)
          meter({
            kind: "video",
            provider: call.provider,
            model: call.model,
            seconds: call.seconds,
            size: call.aspect,
            wallMs: since(started),
          });
        return result;
      });
    },

    forPiece: (piece: string): StageProviders => stageProviders(deps, context, piece),
  };
}
