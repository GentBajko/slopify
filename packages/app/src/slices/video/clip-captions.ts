import { internalError } from "../../kernel/errors.js";
import type { SlideshowClip } from "./ffmpeg.js";

// The captions one clip shows. With captions burned in, each clip draws its own, so every
// frame is encoded once. Burning them over the joined clips encoded each frame a second
// time, from a copy the first encode had already softened, and a caption or an image changed
// re-encoded the whole video.
//
// The script read here is the caption file the stage wrote (`subtitles/captions.ts`,
// `shorts/captions.ts`, with the speaker panel's events from `voices/panel.ts`): each event
// is on screen from its start to its end, and the only thing timed from an event's own start
// is the panel's fade, which is carried across a cut below.

export interface Captions {
  // Everything before the first event: the header, the styles and the events' format line.
  readonly head: string;
  readonly events: readonly CaptionEvent[];
}

interface CaptionEvent {
  // The first frame of the video that shows it, and the first that no longer does.
  readonly from: number;
  readonly to: number;
  // Its own start and end, in milliseconds.
  readonly startMs: number;
  readonly endMs: number;
  // The line before its two times and after them.
  readonly before: string;
  readonly after: string;
}

const eventLine =
  /^(Dialogue:[^,]*),(\d+):(\d\d):(\d\d)\.(\d\d),(\d+):(\d\d):(\d\d)\.(\d\d),(.*)$/s;
const fade = /\\fad\((\d+),(\d+)\)/;

// An event is on the frames at or after its start and before its end, as the renderer shows
// it; whole numbers throughout, so a start that falls on a frame's own time is on that frame.
export function readCaptions(ass: string, fps: number): Captions {
  const head: string[] = [];
  const events: CaptionEvent[] = [];
  for (const text of ass.split("\n")) {
    if (!text.startsWith("Dialogue:")) {
      if (events.length === 0) head.push(text);
      continue;
    }
    const match = eventLine.exec(text);
    if (match === null)
      throw new Error(
        internalError(
          "a caption's times could not be read",
          "Press Make the video again in the project's Video section",
        ),
      );
    const [, before = "", h1, m1, s1, c1, h2, m2, s2, c2, after = ""] = match;
    const start = hundredths(h1, m1, s1, c1);
    const end = hundredths(h2, m2, s2, c2);
    events.push({
      from: Math.ceil((start * fps) / 100),
      to: Math.ceil((end * fps) / 100),
      startMs: start * 10,
      endMs: end * 10,
      before,
      after,
    });
  }
  return { head: head.join("\n"), events };
}

// The script of the clip that plays `count` frames from frame `start` of the video, its
// events timed from the clip's own first frame. Two clips that show the same get the same
// script, so it also tells clips apart (`ffmpeg.ts`, `clip-cache.ts`).
export function clipCaptions(
  captions: Captions,
  start: number,
  count: number,
  fps: number,
): string {
  const lines = captions.events.flatMap((event) => {
    const from = Math.max(0, event.from - start);
    const to = Math.min(count, event.to - start);
    if (to <= from) return [];
    const begins = between(from, fps);
    const after = carried(event, (start * 1000) / fps + begins * 10);
    return [`${event.before},${stamp(begins)},${stamp(between(to, fps))},${after}`];
  });
  return `${[captions.head, ...lines].join("\n")}\n`;
}

// A time between frame `frame` and the one before it, in hundredths of a second: a time that
// fell on a frame's own would be on one side of it or the other by the renderer's rounding.
// floor: a frame lasts more than the hundredth a script can tell apart, so under 100 a second.
function between(frame: number, fps: number): number {
  return frame <= 0 ? 0 : Math.round(((frame - 0.5) * 100) / fps);
}

// An event's fade, timed from where the clip's part of it begins: `beginsMs` on the video. A
// fade in and out are timed from the event's own start and end, so a part given the event's
// `\fad` would fade out at every cut and in again after it. `\fade` says the same as times
// from the part's start, and where the part begins inside a fade it carries on from there.
function carried(event: CaptionEvent, beginsMs: number): string {
  const match = fade.exec(event.after);
  if (match === null) return event.after;
  const fadeIn = Number(match[1]);
  const fadeOut = Number(match[2]);
  const length = event.endMs - event.startMs;
  // The part begins this long after the event (or, under half a frame, before it).
  const offset = Math.round(beginsMs - event.startMs);
  const into = Math.max(0, offset);
  const lead = Math.max(0, -offset);
  const leaves = length - fadeOut;
  const whole = (value: number): string => String(Math.max(0, Math.round(value)));
  const tag =
    into >= leaves && fadeOut > 0
      ? // Already fading out: one ramp from where it stands.
        `\\fade(${whole((255 * (into - leaves)) / fadeOut)},255,255,0,${whole(length - into)},${whole(length - into)},${whole(length - into)})`
      : `\\fade(${whole(fadeIn > 0 ? 255 * (1 - into / fadeIn) : 0)},0,255,${whole(lead)},${whole(lead + fadeIn - into)},${whole(leaves - offset)},${whole(length - offset)})`;
  return event.after.replace(fade, () => tag);
}

function hundredths(
  hours: string | undefined,
  minutes: string | undefined,
  seconds: string | undefined,
  rest: string | undefined,
): number {
  return ((Number(hours) * 60 + Number(minutes)) * 60 + Number(seconds)) * 100 + Number(rest);
}

function stamp(cs: number): string {
  const two = (value: number): string => String(value).padStart(2, "0");
  return `${String(Math.floor(cs / 360_000))}:${two(Math.floor(cs / 6000) % 60)}:${two(Math.floor(cs / 100) % 60)}.${two(cs % 100)}`;
}

// measured on 32 threads, all of them busy, on the first 24 shots of a real project
// (changelog.d/2026-11-13-one-encode.md), in thread-milliseconds a frame: sampled from its
// still, captioned and encoded, 125; sampled and encoded to be decoded again, 130; decoded,
// captioned and encoded, 82. Clips that draw their own captions cost the first for every
// frame of the video; captions over the joined clips cost the second for each distinct clip
// and the third for every frame. The first is the less when the distinct clips are more than
// a third of the video (43 in 130): a still shown once, not twelve that come round for hours.
const leastDistinctShare = 1 / 3;

export function drawsOwnCaptions(
  clips: readonly Pick<SlideshowClip, "name" | "frames">[],
  order: readonly string[],
): boolean {
  const framesOf = new Map(clips.map((clip) => [clip.name, clip.frames]));
  const video = order.reduce((sum, name) => sum + (framesOf.get(name) ?? 0), 0);
  const distinct = clips.reduce((sum, clip) => sum + clip.frames, 0);
  return video > 0 && distinct >= video * leastDistinctShare;
}

// A clip as a render makes it: with its own captions, a clip that comes round again saying
// something else is another clip.
export interface MadeClip {
  // Its file in the working folder.
  readonly name: string;
  readonly clip: SlideshowClip;
  // Its own caption script, when it draws one.
  readonly said?: string | undefined;
}

// The clips of a video whose clips draw their own captions, and the timeline's order of them:
// one for each distinct picture and what it says while it plays.
export function captionedClips(
  clips: readonly SlideshowClip[],
  order: readonly string[],
  captions: Captions,
  fps: number,
): { readonly clips: readonly MadeClip[]; readonly order: readonly string[] } {
  const pictures = new Map(clips.map((clip) => [clip.name, clip]));
  const made: MadeClip[] = [];
  const named = new Map<string, string>();
  let start = 0;
  const played = order.map((picture) => {
    const clip = pictures.get(picture);
    if (clip === undefined)
      throw new Error(
        internalError(
          "the video's edit list lost a clip",
          "Press Make the video again in the project's Video section",
        ),
      );
    const said = clipCaptions(captions, start, clip.frames, fps);
    start += clip.frames;
    const key = `${picture}\u0000${said}`;
    let name = named.get(key);
    if (name === undefined) {
      name = `f${String(made.length + 1)}.mp4`;
      named.set(key, name);
      made.push({ name, clip, said });
    }
    return name;
  });
  return { clips: made, order: played };
}
