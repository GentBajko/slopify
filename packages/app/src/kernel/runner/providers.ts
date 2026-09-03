import type { Clock } from "../clock.js";
import type { Log } from "../log.js";
import type { Format } from "../pipeline.js";
import type { GeneratedImage } from "../ports/image.js";
import type { LlmEvent, Message, Usage } from "../ports/llm.js";
import type { Registry } from "../ports/registry.js";
import type { AttemptContext } from "./attempt.js";
import { attempt } from "./attempt.js";
import type { AttemptStore } from "./attempt-repo.js";
import type { StageContext } from "./index.js";

// What a stage slice is handed instead of a port. Every method is already inside the
// attempt wrapper and none hands back an adapter, so a slice cannot reach a provider
// except through the retry policy; the linter forbids `slices/**` importing `adapters/**`.

export interface LlmAnswer {
  readonly text: string;
  readonly usage: Usage | null;
  readonly finishReason: string | null;
}

export interface LlmCall {
  readonly provider: string;
  readonly model: string;
  readonly messages: readonly Message[];
  readonly webSearch?: boolean | undefined;
  // An answer that arrived but is unusable counts as a failed attempt, so the check runs inside
  // the wrapper. It returns the sentence the stage would show rather than throwing, so a slice
  // never names a failure.
  readonly check?: ((answer: LlmAnswer) => string | undefined) | undefined;
}

export interface TtsCall {
  readonly provider: string;
  readonly voiceId: string;
  readonly text: string;
}

export interface NarratedAudio {
  readonly bytes: Uint8Array;
  readonly container: "mp3";
}

export interface ImageCall {
  readonly provider: string;
  readonly model: string;
  readonly prompt: string;
  readonly aspect: Format;
}

export interface StageProviders {
  // `onEvent` sees the deltas of the attempt in flight. A retry starts the
  // answer again; the text returned is only ever the successful attempt's.
  readonly llm: (call: LlmCall, onEvent?: (event: LlmEvent) => void) => Promise<LlmAnswer>;
  // ceiling: the narration is collected in memory before the slice writes it - a few MB for
  // a few minutes. Streaming to disk needs a partial-file rule for retries first.
  readonly tts: (call: TtsCall) => Promise<NarratedAudio>;
  readonly image: (call: ImageCall) => Promise<GeneratedImage>;
  // The same calls, recorded against one resumable piece.
  readonly forPiece: (pieceId: string) => StageProviders;
}

export interface ProviderDeps {
  readonly registry: Registry;
  readonly attempts: AttemptStore;
  readonly clock: Clock;
  readonly log: Log;
}

export function stageProviders(
  deps: ProviderDeps,
  context: StageContext,
  pieceId?: string,
): StageProviders {
  const ctx: AttemptContext = {
    clock: deps.clock,
    log: deps.log,
    attempts: deps.attempts,
    projectId: context.stage.projectId,
    stage: context.stage.kind,
    stageId: context.stage.id,
    ...(pieceId === undefined ? {} : { pieceId }),
    signal: context.signal,
  };

  return {
    llm: (call: LlmCall, onEvent?: (event: LlmEvent) => void): Promise<LlmAnswer> => {
      // Resolved once; the adapter reads the stored key per request, so a key replaced
      // mid-run still reaches the next attempt.
      const port = deps.registry.llm(call.provider);
      return attempt(
        ctx,
        async (signal: AbortSignal, progress: () => void): Promise<LlmAnswer> => {
          let text = "";
          let usage: Usage | null = null;
          let finishReason: string | null = null;
          for await (const event of port.complete({
            model: call.model,
            messages: call.messages,
            ...(call.webSearch === undefined ? {} : { webSearch: call.webSearch }),
            signal,
          })) {
            // Every event is a sign of life, so the idle clock restarts here.
            progress();
            if (event.type === "delta") {
              text += event.text;
            } else {
              usage = event.usage;
              finishReason = event.finishReason;
            }
            onEvent?.(event);
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
      );
    },

    tts: (call: TtsCall): Promise<NarratedAudio> => {
      const port = deps.registry.tts(call.provider);
      return attempt(
        ctx,
        async (signal: AbortSignal, progress: () => void): Promise<NarratedAudio> => {
          const spoken = await port.synthesize({
            voiceId: call.voiceId,
            text: call.text,
            signal,
          });
          const reader = spoken.audio.getReader();
          const chunks: Uint8Array[] = [];
          let total = 0;
          for (;;) {
            const { done, value } = await reader.read();
            if (done || value === undefined) {
              break;
            }
            progress();
            chunks.push(value);
            total += value.length;
          }
          const bytes = new Uint8Array(total);
          let at = 0;
          for (const chunk of chunks) {
            bytes.set(chunk, at);
            at += chunk.length;
          }
          return { bytes, container: spoken.container };
        },
        { kind: "tts", streaming: port.capabilities.streams },
      );
    },

    image: (call: ImageCall): Promise<GeneratedImage> => {
      const port = deps.registry.image(call.provider);
      return attempt(
        ctx,
        (signal: AbortSignal): Promise<GeneratedImage> =>
          port.generate({
            model: call.model,
            prompt: call.prompt,
            aspect: call.aspect,
            signal,
          }),
        // One request, one answer: the 300 s runs over the whole call.
        { kind: "image" },
      );
    },

    forPiece: (piece: string): StageProviders => stageProviders(deps, context, piece),
  };
}
