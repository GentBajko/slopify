import type { Clock } from "../../kernel/clock.js";
import type { ProviderErrorInit } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsAudio, TtsCapabilities, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";

export interface FakeTtsOptions {
  readonly id?: string;
  readonly capabilities?: TtsCapabilities;
  // The audio, as text: nothing decodes it, and a test can read the bytes back.
  readonly chunks?: readonly string[];
  // Real bytes instead, for the one test that hands what came back to ffmpeg: a
  // concatenation cannot be proved against text pretending to be an mp3.
  readonly bytesFor?: (req: TtsRequest) => readonly Uint8Array[];
  readonly gapMs?: number;
  readonly clock?: Clock;
  readonly failOnAttempt?: Readonly<Record<number, ProviderErrorInit>>;
  readonly refuse?: string;
}

export interface FakeTts extends TtsPort {
  readonly calls: () => number;
  readonly seen: () => readonly string[];
}

export function fakeTts(options: FakeTtsOptions = {}): FakeTts {
  const gapMs = options.gapMs ?? 0;
  if (gapMs > 0 && options.clock === undefined) {
    throw new Error("a fake TTS with a gap between chunks needs a clock to spend it on");
  }
  const chunks = options.chunks ?? ["fake ", "audio"];
  const encoder = new TextEncoder();
  let calls = 0;
  const seen: string[] = [];

  return {
    id: options.id ?? "fake-tts",
    capabilities: options.capabilities ?? { streams: true },
    calls: (): number => calls,
    seen: (): readonly string[] => seen,
    synthesize: (req: TtsRequest): Promise<TtsAudio> => {
      calls += 1;
      seen.push(req.text);
      if (options.refuse !== undefined) {
        return Promise.reject(providerError({ kind: "refusal", message: options.refuse }));
      }
      const failure = options.failOnAttempt?.[calls];
      if (failure !== undefined) {
        return Promise.reject(providerError(failure));
      }
      const parts = options.bytesFor?.(req) ?? chunks.map((chunk) => encoder.encode(chunk));
      let index = 0;
      const audio = new ReadableStream<Uint8Array>({
        pull: async (controller): Promise<void> => {
          const chunk = parts[index];
          if (chunk === undefined) {
            controller.close();
            return;
          }
          if (gapMs > 0 && options.clock !== undefined) {
            await options.clock.sleep(gapMs, req.signal);
          }
          req.signal.throwIfAborted();
          index += 1;
          controller.enqueue(chunk);
        },
      });
      return Promise.resolve({ audio, container: "mp3" });
    },
  };
}
