import { z } from "zod";

// The edit list is the whole video as data: what plays, for how many frames, how it moves,
// and the audio under it. Planning (`plan.ts`) writes one and the renderer (`ffmpeg.ts`,
// `slideshow.ts`) reads nothing else, so a new kind of shot or movement is a new case
// here, in the planner and in the clip filter, and never a change to how the render runs.
// It is plain JSON, recorded in render.json, and carries a version so a later Slopify can
// tell an older list from its own.
//
// Extension points, none of them built yet: `Shot.source` gains a `video` kind for clips,
// `Shot.transition` says how a shot enters from the one before, and effects (a colour
// grade, a text card) become a list on the shot. Each is a new optional field or union
// case, so a version-1 list stays readable; a change that alters what an existing field
// means bumps the version instead.
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

export interface Shot {
  readonly source: ImageSource;
  readonly frames: number;
  readonly motion: Motion;
  // Reserved for the next step: every shot is a hard cut from the one before.
  readonly transition?: undefined;
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
            source: z.object({ kind: z.literal("image"), path: z.string().min(1) }).strict(),
            frames: count,
            motion: motionSchema,
          })
          .strict(),
      )
      .min(1),
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
