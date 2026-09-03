import type { Clock } from "../../kernel/clock.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../../kernel/ports/image.js";
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
  // `logic/09` §Q74: a content-policy refusal, which is never retried.
  readonly refuse?: string;
}

export interface FakeImage extends ImagePort {
  readonly calls: () => number;
  readonly seen: () => readonly ImageRequest[];
}

export function fakeImage(options: FakeImageOptions = {}): FakeImage {
  const takesMs = options.takesMs ?? 0;
  if (takesMs > 0 && options.clock === undefined) {
    throw new Error("a fake image provider that takes time needs a clock to spend it on");
  }
  let calls = 0;
  const seen: ImageRequest[] = [];

  return {
    id: options.id ?? "fake-image",
    models: (): Promise<readonly ModelInfo[]> =>
      Promise.resolve(options.models ?? [{ id: "fake-diffusion", name: "Fake Diffusion" }]),
    calls: (): number => calls,
    seen: (): readonly ImageRequest[] => seen,
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
