import type { Format } from "../admission/model.js";

// logic/11 step 5: 30 fps, 1920×1080 for 16:9 and 1080×1920 for 9:16.
export const fps = 30;
const frames: Readonly<Record<Format, { width: number; height: number }>> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

// §Q85: 100% → 115%, linear, centred, alternating per image.
export const zoomFrom = 1;
export const zoomTo = 1.15;

export type AudioKind = "intro" | "body" | "outro" | "gap";
export type Zoom = "in" | "out";

export interface AudioSegment {
  readonly kind: AudioKind;
  // Absolute path, or null for a silence gap the renderer synthesises.
  readonly path: string | null;
  readonly seconds: number;
}

export interface ImageSlot {
  readonly path: string;
  // 1-based place in the slideshow, which is also what decides the zoom direction.
  readonly index: number;
  readonly frames: number;
  readonly zoom: Zoom;
}

export interface RenderPlan {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly gapSeconds: number;
  readonly audio: readonly AudioSegment[];
  readonly images: readonly ImageSlot[];
  readonly totalFrames: number;
  readonly totalSeconds: number;
  readonly output: string;
}

export interface AudioInput {
  readonly path: string;
  readonly seconds: number;
}

export interface PlanInput {
  readonly format: Format;
  readonly gapSeconds: number;
  readonly intro?: AudioInput | undefined;
  readonly body: AudioInput;
  readonly outro?: AudioInput | undefined;
  // Absolute paths in slideshow order (logic/11 §Q84).
  readonly images: readonly string[];
  readonly output: string;
}

export function planRender(input: PlanInput): RenderPlan {
  if (input.images.length === 0) {
    // logic/04 §Q31 makes an image source mandatory, so an empty set is a bug upstream.
    throw new Error("a render needs at least one image");
  }
  const frame = frames[input.format];
  const audio = timeline(input);
  const totalSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const totalFrames = Math.max(input.images.length, Math.round(totalSeconds * fps));
  return {
    width: frame.width,
    height: frame.height,
    fps,
    gapSeconds: input.gapSeconds,
    audio,
    images: slots(input.images, totalFrames),
    totalFrames,
    totalSeconds,
    output: input.output,
  };
}

// logic/11 step 1: intro, gap, body, gap, outro, with a gap only where the segment on
// the other side of it exists.
function timeline(input: PlanInput): readonly AudioSegment[] {
  const segments: AudioSegment[] = [];
  const gap: AudioSegment = { kind: "gap", path: null, seconds: input.gapSeconds };
  if (input.intro !== undefined) {
    segments.push({ kind: "intro", path: input.intro.path, seconds: input.intro.seconds });
    if (input.gapSeconds > 0) {
      segments.push(gap);
    }
  }
  segments.push({ kind: "body", path: input.body.path, seconds: input.body.seconds });
  if (input.outro !== undefined) {
    if (input.gapSeconds > 0) {
      segments.push(gap);
    }
    segments.push({ kind: "outro", path: input.outro.path, seconds: input.outro.seconds });
  }
  return segments;
}

// logic/11 step 2: the slot is the total divided by the image count, and the last image
// absorbs the frame rounding. §Q100: one image fills the whole length.
// ceiling: every slot holds at least one frame, so a run with more images than the
// timeline has frames renders slightly longer than its audio rather than failing.
function slots(paths: readonly string[], totalFrames: number): readonly ImageSlot[] {
  const each = Math.max(1, Math.floor(totalFrames / paths.length));
  return paths.map((path, at) => ({
    path,
    index: at + 1,
    frames: at === paths.length - 1 ? Math.max(1, totalFrames - each * at) : each,
    // §Q85: odd images zoom in, even images zoom out.
    zoom: at % 2 === 0 ? "in" : "out",
  }));
}
