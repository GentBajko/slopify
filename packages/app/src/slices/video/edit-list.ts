import { z } from "zod";
import { type BuiltInBed, builtInBeds } from "./ambient-bed.js";
import {
  type Atmosphere,
  atmospheres,
  type ColorGrade,
  colorGrades,
  type LookLevel,
  lookLevels,
  type TransitionKind,
} from "./edit-settings.js";

// The edit list is the whole video as data: what plays, for how many frames, how it moves,
// and the audio under it. Planning (`plan.ts`) writes one and the renderer (`ffmpeg.ts`,
// `slideshow.ts`) reads nothing else, so a new kind of shot or movement is a new case
// here, in the planner and in the clip filter, and never a change to how the render runs.
// It is plain JSON, recorded in render.json, and carries a version so a later Slopify can
// tell an older list from its own.
//
// Each extension is a new optional field or union case, so a version-1 list stays readable:
// `Shot.source` has a `video` kind for clips, `Shot.transition` says how a shot enters from
// the one before, and the list's `look` and `cards` are the effects every shot is rendered
// with. A change that alters what an existing field means bumps the version instead.
export const editListVersion = 1;

export type SpokenKind = "intro" | "body" | "outro";
// A gap sits between two spoken segments; an edge is the quiet lead-in before the first and
// the tail after the last.
export type AudioKind = SpokenKind | "gap" | "edge";

export interface AudioSegment {
  readonly kind: AudioKind;
  // Absolute path, or null for a silence gap the renderer synthesises.
  readonly path: string | null;
  readonly seconds: number;
}

// Where the crop window sits in the room the zoom leaves around it: 0 is flush with the
// left (or top) edge, 1 with the right (or bottom), 0.5 centred. A share of the free
// space rather than pixels, so one list reads the same at any output size.
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type ZoomDirection = "in" | "out";

// `percent` is the project's zoom in half steps, as Edit project takes it: 22.5 is a
// crop of 100% / 122.5%. The renderer turns it into exact decimal text (`zoomRange`).
export type Motion =
  // Linear and centred between 100% and 100% + percent.
  | { readonly kind: "zoom"; readonly direction: ZoomDirection; readonly percent: number }
  // A fixed crop of 100% + percent that travels in a straight line from one point to the
  // other over the shot.
  | { readonly kind: "pan"; readonly from: Point; readonly to: Point; readonly percent: number }
  // The whole still, not moving.
  | { readonly kind: "still" };

export interface ImageSource {
  readonly kind: "image";
  // Absolute while rendering; project-relative in render.json.
  readonly path: string;
}

// A moving clip: an uploaded video, or an image a model animated. It plays muted from its
// start, slowed (at most to half speed) and then looped to fill its shot (`ffmpeg.ts`); its
// own length is measured when the video is planned.
export interface VideoSource {
  readonly kind: "video";
  readonly path: string;
  readonly seconds: number;
}

export type TransitionStyle = Exclude<TransitionKind, "cut">;

// How a shot enters from the one before, centred on the cut: the one before gives up its
// last `floor(frames / 2)` frames and this one its first `ceil(frames / 2)`, and the two
// play blended in one clip of `frames` frames in between, so the timeline keeps its length
// (`transitions.ts`). Absent is a hard cut.
export interface Transition {
  readonly kind: TransitionStyle;
  readonly frames: number;
}

export interface Shot {
  readonly source: ImageSource | VideoSource;
  readonly frames: number;
  readonly motion: Motion;
  readonly transition?: Transition | undefined;
}

// Filters every shot is rendered with (`look.ts`). Absent renders exactly as before.
export interface Look {
  readonly vignette: LookLevel;
  readonly grain: LookLevel;
  readonly grade: ColorGrade;
  readonly atmosphere: Atmosphere;
}

// A title card over the picture, from `startFrame` for `frames`, in the list's card font.
export interface Card {
  readonly title: string;
  readonly startFrame: number;
  readonly frames: number;
}

export interface CardFont {
  // Absolute while rendering; project-relative in render.json.
  readonly path: string;
  // The family name the cards' ASS style asks libass for.
  readonly name: string;
}

// The ambient sound under the whole video (`ambient-bed.ts`): made from noise, or the user's
// file looped. It fades in from the start and fades out from `fadeOutAt`, where the narration
// ends, over `fadeOutSeconds`; the join ducks it under the voice (`ffmpeg.ts`).
export interface AmbientBed {
  readonly source:
    | { readonly kind: "noise"; readonly preset: BuiltInBed }
    // Absolute while rendering; project-relative in render.json.
    | { readonly kind: "file"; readonly path: string };
  readonly levelDb: number;
  readonly fadeInSeconds: number;
  readonly fadeOutAt: number;
  readonly fadeOutSeconds: number;
}

export interface EditList {
  readonly version: typeof editListVersion;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  // Played back to back from the start of the video.
  readonly audio: readonly AudioSegment[];
  // Played back to back from the start of the video; together they run the full length.
  readonly shots: readonly Shot[];
  readonly look?: Look | undefined;
  // In timeline order; drawn with `cardFont`, which is present whenever cards are.
  readonly cards?: readonly Card[] | undefined;
  readonly cardFont?: CardFont | undefined;
  // The cards' text colour, #RRGGBB; absent is white.
  readonly cardColor?: string | undefined;
  // Absent is the narration alone, as every video before it.
  readonly bed?: AmbientBed | undefined;
}

// The same list with every file path passed through `map`: render.json records paths
// relative to the project folder.
export function withPaths(edit: EditList, map: (path: string) => string): EditList {
  return {
    ...edit,
    audio: edit.audio.map((segment) => ({
      ...segment,
      path: segment.path === null ? null : map(segment.path),
    })),
    shots: edit.shots.map((shot) => ({
      ...shot,
      source: { ...shot.source, path: map(shot.source.path) },
    })),
    ...(edit.cardFont === undefined
      ? {}
      : { cardFont: { ...edit.cardFont, path: map(edit.cardFont.path) } }),
    ...(edit.bed?.source.kind === "file"
      ? { bed: { ...edit.bed, source: { kind: "file", path: map(edit.bed.source.path) } } }
      : {}),
  };
}

const share = z.number().min(0).max(1);
const point = z.object({ x: share, y: share }).strict();
const percent = z.number().min(0);
const motionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("zoom"), direction: z.enum(["in", "out"]), percent }).strict(),
  z.object({ kind: z.literal("pan"), from: point, to: point, percent }).strict(),
  z.object({ kind: z.literal("still") }).strict(),
]);
const count = z.number().int().positive();
const sourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("image"), path: z.string().min(1) }).strict(),
  z
    .object({ kind: z.literal("video"), path: z.string().min(1), seconds: z.number().positive() })
    .strict(),
]);
const transitionSchema = z
  .object({ kind: z.enum(["crossfade", "fadeblack", "slide", "wipe"]), frames: count })
  .strict();
const lookSchema = z
  .object({
    vignette: z.enum(lookLevels),
    grain: z.enum(lookLevels),
    grade: z.enum(colorGrades),
    atmosphere: z.enum(atmospheres),
  })
  .strict();
const cardSchema = z
  .object({ title: z.string().min(1), startFrame: z.number().int().nonnegative(), frames: count })
  .strict();
const editListSchema = z
  .object({
    version: z.literal(editListVersion),
    width: count,
    height: count,
    fps: count,
    audio: z.array(
      z
        .object({
          kind: z.enum(["intro", "body", "outro", "gap", "edge"]),
          path: z.string().nullable(),
          seconds: z.number().nonnegative(),
        })
        .strict(),
    ),
    shots: z
      .array(
        z
          .object({
            source: sourceSchema,
            frames: count,
            motion: motionSchema,
            transition: transitionSchema.optional(),
          })
          .strict(),
      )
      .min(1),
    look: lookSchema.optional(),
    cards: z.array(cardSchema).optional(),
    cardFont: z
      .object({ path: z.string().min(1), name: z.string().min(1) })
      .strict()
      .optional(),
    cardColor: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    bed: z
      .object({
        source: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("noise"), preset: z.enum(builtInBeds) }).strict(),
          z.object({ kind: z.literal("file"), path: z.string().min(1) }).strict(),
        ]),
        levelDb: z.number(),
        fadeInSeconds: z.number().nonnegative(),
        fadeOutAt: z.number().nonnegative(),
        fadeOutSeconds: z.number().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();

// Reads a recorded edit list back. Strict, so a list written by a newer Slopify, with a
// field or kind this one does not know, is refused rather than rendered without it.
export function readEditList(value: unknown): EditList {
  const version =
    typeof value === "object" && value !== null && "version" in value ? value.version : undefined;
  if (version !== editListVersion)
    throw new Error(
      `This video's edit list is version ${String(version)}, and this Slopify reads version ${editListVersion}. Update Slopify, or use Re-run section on Video to plan it again.`,
    );
  const parsed = editListSchema.safeParse(value);
  if (!parsed.success)
    throw new Error(
      `This video's edit list is damaged (${parsed.error.issues[0]?.path.join(".") || "the list"}: ${parsed.error.issues[0]?.message ?? "not readable"}). Use Re-run section on Video to plan it again.`,
    );
  return parsed.data;
}
