import type { Format, MotionStyle } from "../admission/model.js";
import type { TimedChapter } from "./chapters.js";
import { chapterCuts, narrationShotFrames } from "./cuts.js";
import {
  type AmbientBed,
  type AudioKind,
  type AudioSegment,
  type Card,
  type CardFont,
  type EditList,
  editListVersion,
  type Look,
  type Shot,
  type SpokenKind,
  type TransitionStyle,
  type VideoSource,
} from "./edit-list.js";
import { chapterCardSeconds, endScreenSeconds } from "./edit-settings.js";
import { hasLook } from "./look.js";
import { motionFor } from "./motion.js";
import { withTransitions } from "./transitions.js";

// 30 fps, 1920×1080 for 16:9 and 1080×1920 for 9:16.
export const fps = 30;
const frames: Readonly<Record<Format, { width: number; height: number }>> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

// A zoom shot zooms linearly and centred between 100% and 100% + the project's zoom
// percent; a pan holds 100% + its percent while it travels. The ends are formatted into an ffmpeg
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

// Whole thousandths as decimal text, for anything that goes into an ffmpeg expression.
export function decimal(thousandths: number): string {
  const fraction = String(thousandths % 1000)
    .padStart(3, "0")
    .replace(/0+$/, "");
  const whole = String(Math.floor(thousandths / 1000));
  return fraction === "" ? whole : `${whole}.${fraction}`;
}

export type { AudioKind, AudioSegment, SpokenKind } from "./edit-list.js";

// What the video stage decided: the project settings it planned from, the edit list the
// renderer plays, and where the result goes. Everything about the picture and the sound
// is in `editList`; the rest is recorded so render.json says why the list is what it is.
export interface RenderPlan {
  readonly gapSeconds: number;
  readonly edgeSeconds: number;
  readonly imageSeconds: number;
  readonly zoomPercent: number;
  readonly motionStyle: MotionStyle;
  readonly editList: EditList;
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
  readonly motionStyle: MotionStyle;
  readonly intro?: AudioInput | undefined;
  readonly body?: AudioInput | undefined;
  readonly outro?: AudioInput | undefined;
  // Absolute paths in slideshow order.
  readonly images: readonly string[];
  readonly output: string;
  // Absent is the slideshow as it always was.
  readonly edit?: PlanEdit | undefined;
  // The ambient bed (`ambient-bed.ts`), already resolved from the project's files. Absent, or a
  // video without narration, is the narration alone, as every video before it.
  readonly bed?: PlanBed | undefined;
}

export interface PlanBed {
  readonly source: AmbientBed["source"];
  readonly levelDb: number;
  readonly fadeInSeconds: number;
  readonly tailSeconds: number;
}

// What the Video stage's edit settings add, already resolved from the project's files.
export interface PlanEdit {
  // Present when the cuts follow the narration: the sentence pauses and chapter starts, in
  // seconds (`cuts.ts`).
  readonly narration?:
    | { readonly cutPoints: readonly number[]; readonly chapterStarts: readonly number[] }
    | undefined;
  readonly transition?: { readonly kind: TransitionStyle; readonly seconds: number } | undefined;
  readonly look?: Look | undefined;
  // A card at each chapter start, in the font given.
  // The brand kit's end screen joins them over the last seconds, in the same font; `color` is
  // the cards' text colour.
  readonly cards?:
    | {
        readonly chapters: readonly TimedChapter[];
        readonly font: CardFont;
        readonly color?: string | undefined;
        readonly endScreen?: string | undefined;
      }
    | undefined;
  // Moving clips shown in place of the image at the same place in `images`: uploaded clips
  // and animated images.
  readonly clips?: readonly (VideoSource | undefined)[] | undefined;
}

export function planRender(input: PlanInput): RenderPlan {
  if (input.images.length === 0) {
    // Admission permits Video only with an image source, so an empty set is a bug upstream.
    throw new Error(
      "The video needs at least one image, but there are none. Check the Images section in Edit project, then Try again.",
    );
  }
  const frame = frames[input.format];
  const bed = input.body === undefined ? undefined : input.bed;
  const timeline = input.body === undefined ? [] : audioTimeline({ ...input, body: input.body });
  const audio = bed === undefined ? timeline : withTail(timeline, bed.tailSeconds);
  // A silent video shows every image once, which is the one length it has to go on.
  const totalSeconds =
    input.body === undefined
      ? input.images.length * input.imageSeconds
      : audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const totalFrames = Math.max(1, Math.round(totalSeconds * fps));
  const edit = input.edit;
  const narration = input.body === undefined ? undefined : edit?.narration;
  const lengths =
    narration === undefined
      ? everyLengths(Math.max(1, Math.round(input.imageSeconds * fps)), totalFrames)
      : narrationShotFrames({
          totalFrames,
          fps,
          imageSeconds: input.imageSeconds,
          cutPoints: narration.cutPoints,
          chapterStarts: narration.chapterStarts,
        });
  const planned = shots(input, lengths);
  const transition = edit?.transition;
  const cards =
    edit?.cards === undefined
      ? []
      : withEndScreen(
          chapterCards(edit.cards.chapters, narration?.cutPoints ?? [], totalFrames),
          edit.cards.endScreen,
          totalFrames,
        );
  return {
    gapSeconds: input.gapSeconds,
    edgeSeconds: input.edgeSeconds,
    imageSeconds: input.imageSeconds,
    zoomPercent: input.zoomPercent,
    motionStyle: input.motionStyle,
    editList: {
      version: editListVersion,
      width: frame.width,
      height: frame.height,
      fps,
      audio,
      shots:
        transition === undefined
          ? planned
          : withTransitions(planned, transition.kind, Math.round(transition.seconds * fps)),
      ...(edit?.look !== undefined && hasLook(edit.look) ? { look: edit.look } : {}),
      ...(cards.length > 0 && edit?.cards !== undefined
        ? {
            cards,
            cardFont: edit.cards.font,
            ...(edit.cards.color === undefined ? {} : { cardColor: edit.cards.color }),
          }
        : {}),
      ...(bed === undefined
        ? {}
        : {
            bed: {
              source: bed.source,
              levelDb: bed.levelDb,
              fadeInSeconds: bed.fadeInSeconds,
              fadeOutAt: narrationEnd(timeline),
              fadeOutSeconds: bed.tailSeconds,
            },
          }),
    },
    totalFrames,
    totalSeconds,
    output: input.output,
  };
}

// The timeline with the ambient bed's tail: the silence after the last spoken segment runs at
// least `tail` seconds, so the bed can fade out under the end of the picture. A tail no longer
// than that silence changes nothing, so the video keeps its length.
export function withTail(audio: readonly AudioSegment[], tail: number): readonly AudioSegment[] {
  const last = audio.at(-1);
  if (last === undefined || tail <= 0) return audio;
  if (last.kind === "edge")
    return last.seconds >= tail ? audio : [...audio.slice(0, -1), { ...last, seconds: tail }];
  return [...audio, { kind: "edge", path: null, seconds: tail }];
}

// Where the last spoken segment ends, in seconds from the start of the video.
function narrationEnd(audio: readonly AudioSegment[]): number {
  const trailing = audio.at(-1)?.kind === "edge" ? (audio.at(-1)?.seconds ?? 0) : 0;
  return audio.reduce((sum, segment) => sum + segment.seconds, 0) - trailing;
}

// A card at each chapter start, on the cut the chapter's shot starts with (a chapter at the
// very start stays there), for 2.5 s or what is left of the video.
function chapterCards(
  chapters: readonly TimedChapter[],
  cutPoints: readonly number[],
  totalFrames: number,
): readonly Card[] {
  const length = Math.round(chapterCardSeconds * fps);
  const cards: Card[] = [];
  for (const chapter of chapters) {
    const title = chapter.title.trim();
    const moved = chapter.start < 1 / fps ? [] : chapterCuts([chapter.start], cutPoints, Infinity);
    const startFrame = Math.max(0, Math.round((moved[0] ?? chapter.start) * fps));
    const frames = Math.min(length, totalFrames - startFrame);
    if (title === "" || frames < 1) continue;
    // Two chapters inside 2.5 s would stack their cards; the second is left out.
    const previous = cards.at(-1);
    if (previous !== undefined && startFrame < previous.startFrame + previous.frames) continue;
    cards.push({ title, startFrame, frames });
  }
  return cards;
}

// The end screen over the last seconds (or the whole of a shorter video). A chapter card that
// would still be showing is cut short where the end screen starts; one starting inside it is
// left out.
export function withEndScreen(
  cards: readonly Card[],
  text: string | undefined,
  totalFrames: number,
): readonly Card[] {
  const title = text?.trim() ?? "";
  if (title === "") return cards;
  const frames = Math.min(totalFrames, Math.round(endScreenSeconds * fps));
  const startFrame = totalFrames - frames;
  return [
    ...cards.flatMap((card) =>
      card.startFrame >= startFrame
        ? []
        : [{ ...card, frames: Math.min(card.frames, startFrame - card.startFrame) }],
    ),
    { title, startFrame, frames },
  ];
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

// Every N seconds: each shot `each` frames until the timeline is full; the last shot is cut
// to what is left. A timeline shorter than one shot is a single shot.
function everyLengths(each: number, totalFrames: number): readonly number[] {
  const count = Math.ceil(totalFrames / each);
  return Array.from({ length: count }, (_value, at) => Math.min(each, totalFrames - each * at));
}

// The images take turns in slideshow order, one per shot, starting over after the last until
// the timeline is full. The motion goes by the shot's place, not the image (`motion.ts`), so
// an image that comes round again may move another way. A moving clip in an image's place
// plays as it is, with no motion of its own.
function shots(
  input: Pick<PlanInput, "images" | "motionStyle" | "zoomPercent" | "edit">,
  lengths: readonly number[],
): readonly Shot[] {
  return lengths.map((frames, at) => {
    const index = at % input.images.length;
    const clip = input.edit?.clips?.[index];
    return clip === undefined
      ? {
          source: { kind: "image", path: input.images[index] ?? "" },
          frames,
          motion: motionFor(input.motionStyle, at, input.zoomPercent),
        }
      : { source: clip, frames, motion: { kind: "still" } };
  });
}
