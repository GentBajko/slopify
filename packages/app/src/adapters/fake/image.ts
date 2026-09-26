import type { Clock } from "../../kernel/clock.js";
import type {
  AnimateRequest,
  GeneratedImage,
  GeneratedVideo,
  ImagePort,
  ImageRequest,
} from "../../kernel/ports/image.js";
import type { ModelInfo, ProviderErrorInit } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";

export interface FakeImageOptions {
  readonly id?: string;
  readonly models?: readonly ModelInfo[];
  readonly bytes?: Uint8Array;
  readonly mime?: GeneratedImage["mime"];
  // Fake milliseconds the call takes, spent on the injected clock.
  readonly takesMs?: number;
  readonly clock?: Clock;
  readonly failOnAttempt?: Readonly<Record<number, ProviderErrorInit>>;
  // A content-policy refusal, which is never retried.
  readonly refuse?: string;
  // The clip every animation answers with; absent, the fake cannot animate at all.
  readonly video?: Uint8Array;
  // Animations that fail, by call number, like `failOnAttempt`.
  readonly failAnimateOnAttempt?: Readonly<Record<number, ProviderErrorInit>>;
}

export interface FakeImage extends ImagePort {
  readonly calls: () => number;
  readonly seen: () => readonly ImageRequest[];
  readonly animated: () => readonly AnimateRequest[];
}

export function fakeImage(options: FakeImageOptions = {}): FakeImage {
  const takesMs = options.takesMs ?? 0;
  if (takesMs > 0 && options.clock === undefined) {
    throw new Error("a fake image provider that takes time needs a clock to spend it on");
  }
  let calls = 0;
  const seen: ImageRequest[] = [];
  const animated: AnimateRequest[] = [];

  return {
    id: options.id ?? "fake-image",
    models: (): Promise<readonly ModelInfo[]> =>
      Promise.resolve(options.models ?? [{ id: "fake-diffusion", name: "Fake Diffusion" }]),
    calls: (): number => calls,
    seen: (): readonly ImageRequest[] => seen,
    animated: (): readonly AnimateRequest[] => animated,
    ...(options.video === undefined
      ? {}
      : {
          animate: (req: AnimateRequest): Promise<GeneratedVideo> => {
            animated.push(req);
            const failure = options.failAnimateOnAttempt?.[animated.length];
            if (failure !== undefined) return Promise.reject(providerError(failure));
            req.signal.throwIfAborted();
            return Promise.resolve({ bytes: options.video ?? new Uint8Array(), mime: "video/mp4" });
          },
        }),
    generate: async (req: ImageRequest): Promise<GeneratedImage> => {
      calls += 1;
      seen.push(req);
      if (options.refuse !== undefined) {
        throw providerError({ kind: "refusal", message: options.refuse });
      }
      const failure = options.failOnAttempt?.[calls];
      if (failure !== undefined) {
        throw providerError(failure);
      }
      if (takesMs > 0 && options.clock !== undefined) {
        await options.clock.sleep(takesMs, req.signal);
      }
      req.signal.throwIfAborted();
      return {
        bytes: options.bytes ?? new Uint8Array([137, 80, 78, 71]),
        mime: options.mime ?? "image/png",
      };
    },
  };
}
