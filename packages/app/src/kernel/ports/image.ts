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

// A still brought to life: an image-to-video model animates `image` for about `seconds`,
// steered by `prompt`. The clip is muted by the renderer, so any sound the model adds is
// never heard.
export interface AnimateRequest {
  readonly model: string;
  readonly prompt: string;
  readonly image: GeneratedImage;
  readonly aspect: Format;
  readonly seconds: number;
  readonly signal: AbortSignal;
}

export interface GeneratedVideo {
  readonly bytes: Uint8Array;
  readonly mime: "video/mp4";
}

export interface ImagePort {
  readonly id: string;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly generate: (req: ImageRequest) => Promise<GeneratedImage>;
  // Only the providers that host image-to-video models have it.
  readonly animate?: ((req: AnimateRequest) => Promise<GeneratedVideo>) | undefined;
}
