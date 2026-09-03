import type { Format } from "../pipeline.js";
import type { ModelInfo } from "./model.js";

export interface ImageRequest {
  readonly model: string;
  readonly prompt: string;
  // The adapter asks its provider for the closest supported size to
  // the run's format; anything left over is fitted by the renderer.
  readonly aspect: Format;
  readonly signal: AbortSignal;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly mime: "image/png" | "image/jpeg";
}

export interface ImagePort {
  readonly id: string;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly generate: (req: ImageRequest) => Promise<GeneratedImage>;
}
