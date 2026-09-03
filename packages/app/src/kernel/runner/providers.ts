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

// What a stage slice is handed instead of a port. Every method here is already inside
// the attempt wrapper and none of them takes a signal or hands back an adapter, so a
// slice has nothing to call around: it cannot reach a provider except through the retry
// policy. The linter holds the other half, forbidding `slices/**` to import `adapters/**`.

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
  // `logic/06` §Q50 and §Q55, `logic/07` §Q61: an answer that arrived but is unusable -
  // empty, or without the Sources list the instruction asked for - "counts as a failed
  // attempt", so the check has to run inside the wrapper for the retry policy to cover
  // it. It returns the sentence the stage would show rather than throwing, so a slice
  // still never names a provider failure (03-conventions).
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
  // `onEvent` sees the deltas of the attempt in flight, for the text streamed onto the
  // page (`logic/01` §Q6). A retry starts the answer again, so a caller that has already
  // shown deltas has to say so; the text returned is only ever the successful attempt's.
  readonly llm: (call: LlmCall, onEvent?: (event: LlmEvent) => void) => Promise<LlmAnswer>;
  // ceiling: the narration is collected in memory before the slice writes it, which for
  // a few minutes of mp3 is a few megabytes. Streaming it to disk as it arrives is the
  // upgrade, and it needs a partial-file rule for a retry first (`logic/13` step 2).
  readonly tts: (call: TtsCall) => Promise<NarratedAudio>;
  readonly image: (call: ImageCall) => Promise<GeneratedImage>;
  // The same calls, recorded against one resumable piece: an image of twenty, a research
  // chapter, an audio chunk (`logic/09` §Q73).
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
      // Resolved once: an adapter reads the stored key when it builds each request, so a
      // key replaced mid-run still reaches the next attempt (`logic/02` §Q16).
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
            // Every event is a sign of life, so the idle clock restarts here rather than
            // in each slice that consumes one.
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
            // Thrown bare: the wrapper is the one place a failure is named, and it names
            // this `other`, which is retried like any other bad answer.
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
        // One request, one answer: the 300 s runs over the whole call (`logic/09` §Q77).
        { kind: "image" },
      );
    },

    forPiece: (piece: string): StageProviders => stageProviders(deps, context, piece),
  };
}
