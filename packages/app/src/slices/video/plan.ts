import type { Format } from "../admission/model.js";

// 30 fps, 1920×1080 for 16:9 and 1080×1920 for 9:16.
export const fps = 30;
const frames: Readonly<Record<Format, { width: number; height: number }>> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

// Each slot zooms linearly and centred between 100% and 100% + the project's zoom
// percent, alternating in and out per slot. The ends are formatted into an ffmpeg
// expression, so they are built from whole thousandths as decimal text rather than by
// float arithmetic: 1 + 0.225 is exact, but 1.225 - 1 is not 0.225 in binary floating
// point, and a percent in half steps is always a whole number of thousandths.
export const zoomFrom = "1";

export interface ZoomRange {
  readonly from: string;
  readonly to: string;
  readonly by: string;
}

// undefined for 0%: the still does not move.
export function zoomRange(percent: number): ZoomRange | undefined {
  const thousandths = Math.round(percent * 10);
  if (thousandths <= 0) return undefined;
  return { from: zoomFrom, to: decimal(1000 + thousandths), by: decimal(thousandths) };
}

function decimal(thousandths: number): string {
  const fraction = String(thousandths % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  const whole = String(Math.floor(thousandths / 1000));
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

export type SpokenKind = "intro" | "body" | "outro";
// A gap sits between two spoken segments; an edge is the quiet lead-in before the first and
// the tail after the last.
export type AudioKind = SpokenKind | "gap" | "edge";
export type Zoom = "in" | "out";

export interface AudioSegment {
  readonly kind: AudioKind;
  // Absolute path, or null for a silence gap the renderer synthesises.
  readonly path: string | null;
  readonly seconds: number;
}

export interface ImageSlot {
  readonly path: string;
  // 1-based place in the timeline, which is also what decides the zoom direction. The
  // same image comes back in later slots once the images have all been shown.
  readonly index: number;
  readonly frames: number;
  readonly zoom: Zoom;
}

export interface RenderPlan {
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly gapSeconds: number;
  readonly edgeSeconds: number;
  readonly imageSeconds: number;
  readonly zoomPercent: number;
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
  readonly edgeSeconds: number;
  readonly imageSeconds: number;
  readonly zoomPercent: number;
  readonly intro?: AudioInput | undefined;
  readonly body?: AudioInput | undefined;
  readonly outro?: AudioInput | undefined;
  // Absolute paths in slideshow order.
  readonly images: readonly string[];
  readonly output: string;
}

export function planRender(input: PlanInput): RenderPlan {
  if (input.images.length === 0) {
    // Admission permits Video only with an image source, so an empty set is a bug upstream.
    throw new Error(
      "The video needs at least one image, but there are none. Check the Images section in Edit project, then Retry stage.",
    );
  }
  const frame = frames[input.format];
  const audio = input.body === undefined ? [] : audioTimeline({ ...input, body: input.body });
  // A silent video shows every image once, which is the one length it has to go on.
  const totalSeconds =
    input.body === undefined
      ? input.images.length * input.imageSeconds
      : audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const totalFrames = Math.max(1, Math.round(totalSeconds * fps));
  return {
    width: frame.width,
    height: frame.height,
    fps,
    gapSeconds: input.gapSeconds,
    edgeSeconds: input.edgeSeconds,
    imageSeconds: input.imageSeconds,
    zoomPercent: input.zoomPercent,
    audio,
    images: slots(input.images, Math.max(1, Math.round(input.imageSeconds * fps)), totalFrames),
    totalFrames,
    totalSeconds,
    output: input.output,
  };
}

export function spoken(kind: AudioKind): kind is SpokenKind {
  return kind !== "gap" && kind !== "edge";
}

// Edge, intro, gap, body, gap, outro, edge, with a gap only where the segment on the other
// side of it exists. Captions walk these same segments, so the lead-in shifts every cue.
export function audioTimeline(
  input: Pick<PlanInput, "gapSeconds" | "edgeSeconds" | "intro" | "outro"> & {
    readonly body: AudioInput;
  },
  minimumGap = 1 / fps,
): readonly AudioSegment[] {
  const segments: AudioSegment[] = [];
  const gap: AudioSegment = { kind: "gap", path: null, seconds: input.gapSeconds };
  const edge: AudioSegment = { kind: "edge", path: null, seconds: input.edgeSeconds };
  // Video keeps its existing minimum of one frame. WAV passes one sample instead,
  // because its gap duration is independent of the slideshow's frame rate.
  const audible = input.gapSeconds >= minimumGap;
  const edged = input.edgeSeconds >= minimumGap;
  if (edged) {
    segments.push(edge);
  }
  if (input.intro !== undefined) {
    segments.push({ kind: "intro", path: input.intro.path, seconds: input.intro.seconds });
    if (audible) {
      segments.push(gap);
    }
  }
  segments.push({ kind: "body", path: input.body.path, seconds: input.body.seconds });
  if (input.outro !== undefined) {
    if (audible) {
      segments.push(gap);
    }
    segments.push({ kind: "outro", path: input.outro.path, seconds: input.outro.seconds });
  }
  if (edged) {
    segments.push(edge);
  }
  return segments;
}

// The images take turns in slideshow order, each for `each` frames, starting over after the
// last until the timeline is full; the last slot is cut to what is left. A timeline shorter
// than one slot is a single slot. Zoom alternates per slot, not per image, so an image
// that comes round again may zoom the other way.
function slots(paths: readonly string[], each: number, totalFrames: number): readonly ImageSlot[] {
  const count = Math.ceil(totalFrames / each);
  return Array.from({ length: count }, (_value, at) => ({
    path: paths[at % paths.length] ?? "",
    index: at + 1,
    frames: Math.min(each, totalFrames - each * at),
    // Odd slots zoom in, even slots zoom out.
    zoom: at % 2 === 0 ? "in" : "out",
  }));
}
