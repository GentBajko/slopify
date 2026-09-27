import type { Format } from "../pipeline.js";
import type { ModelInfo } from "./model.js";

export interface ImageRequest {
  readonly model: string;
  readonly prompt: string;
  // The adapter asks its provider for the closest supported size to
  // the run's format; anything left over is fitted by the renderer.
  readonly aspect: Format;
  readonly signal: AbortSignal;
  // How hard an agent-driven provider works on the image (the Codex CLI's reasoning effort).
  // Absent is the provider's default.
  readonly thinking?: import("./llm.js").ThinkingMode | undefined;
  // The project's establishing image: drawn with it as a visual reference for characters,
  // style and palette. Only a model that takes an input image is ever sent one.
  readonly reference?: GeneratedImage | undefined;
  // A line saying how far a long image job has got, for the stage's live panel.
  readonly onProgress?: ((text: string) => void) | undefined;
}

export interface GeneratedImage {
  readonly bytes: Uint8Array;
  readonly mime: "image/png" | "image/jpeg";
  // What an agent-driven provider (the Codex CLI) reported spending on the image: its tokens
  // and its plan windows. Absent for providers that report neither.
  readonly usage?: import("./llm.js").Usage | undefined;
  readonly limits?: import("./plan-limits.js").PlanLimitReading | undefined;
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
  // How long one image may take, when this provider needs longer than the usual 300 s: an
  // agent that reviews and redraws its own work runs for many minutes.
  readonly timeoutMs?: number | undefined;
  readonly models: () => Promise<readonly ModelInfo[]>;
  readonly generate: (req: ImageRequest) => Promise<GeneratedImage>;
  // Only the providers that host image-to-video models have it.
  readonly animate?: ((req: AnimateRequest) => Promise<GeneratedVideo>) | undefined;
}

// How long an agent-driven image job (the Codex CLI reviewing and redrawing its image) may
// run, on this machine or through the host helper.
export const agentImageTimeoutMs = 30 * 60_000;
