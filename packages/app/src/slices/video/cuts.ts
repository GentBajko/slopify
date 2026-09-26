import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { transcriptSentences } from "../youtube/transcript.js";
import { cutFloorShare } from "./edit-settings.js";

// "Follow the narration": every cut lands in the pause after a sentence, as near to Seconds
// per image as the sentences allow, and a chapter always starts on a new shot. Pure, so the
// same timing plans the same cuts every time and a re-render is identical.
//
// The images carry no link to a passage of the article: each one is rendered from an image
// prompt template filled with the run's keyword values, never from a paragraph. So they are
// spread over the narration in slideshow order, taking turns as they do with Every N
// seconds; only where the cuts fall changes.

// A cut sits in the pause between two sentences: halfway through it, but never more than this
// long after the last word, so a long breath does not hold the old picture over the new
// sentence's first word.
const pauseCutSeconds = 0.25;
// A chapter start is moved onto the nearest sentence pause within this many seconds; a
// chapter the model or a heading places mid-sentence would otherwise cut mid-word.
const chapterSnapSeconds = 3;

// Where the narration pauses between sentences, in seconds into the video. The word times
// already count the silence at the start, the intro and the gaps (`runtime-subtitles.ts`).
export function sentenceCutPoints(words: readonly TimedWord[]): readonly number[] {
  const sentences = transcriptSentences(words);
  const points: number[] = [];
  for (const [index, sentence] of sentences.entries()) {
    const next = sentences[index + 1];
    if (next === undefined) break;
    const pause = Math.max(0, next.start - sentence.end);
    points.push(sentence.end + Math.min(pause / 2, pauseCutSeconds));
  }
  return points;
}

export interface NarrationCutInput {
  readonly totalFrames: number;
  readonly fps: number;
  readonly imageSeconds: number;
  // Sentence pauses, in seconds (`sentenceCutPoints`).
  readonly cutPoints: readonly number[];
  // Chapter starts, in seconds; each one is a cut, snapped to a nearby pause.
  readonly chapterStarts: readonly number[];
  readonly floorShare?: number | undefined;
}

// The frames of each shot, in timeline order, adding up to `totalFrames`. Between two
// chapter starts the shots are laid greedily: each next cut is the sentence pause nearest to
// Seconds per image after the last one, no nearer than the floor (40% of it) and no further
// than twice it; with no pause in that window the cut falls at Seconds per image, as it does
// with Every N seconds. What is left before a chapter start that could not hold a full shot
// and a floor-length one after it becomes the last shot, so no shot runs past 1.4 times
// Seconds per image unless the sentences leave no pause.
export function narrationShotFrames(input: NarrationCutInput): readonly number[] {
  const total = input.totalFrames / input.fps;
  if (!(total > 0) || !(input.imageSeconds > 0)) return [Math.max(1, input.totalFrames)];
  const floor = input.imageSeconds * (input.floorShare ?? cutFloorShare);
  const points = [...input.cutPoints]
    .filter((point) => Number.isFinite(point) && point > 0 && point < total)
    .toSorted((left, right) => left - right);
  // A chapter that opens with the narration's first words would cut the silence before them
  // into a shot of its own; the first shot opens that chapter anyway.
  const bounds = chapterCuts(input.chapterStarts, points, total).filter((cut) => cut >= floor);
  const cuts: number[] = [];
  let start = 0;
  for (const end of [...bounds, total]) {
    let position = start;
    while (end - position > input.imageSeconds + floor) {
      const target = position + input.imageSeconds;
      const low = position + floor;
      const high = Math.min(position + 2 * input.imageSeconds, end - floor);
      const cut = nearest(
        points.filter((point) => point >= low && point <= high),
        target,
      );
      position = cut ?? target;
      cuts.push(position);
    }
    if (end < total) cuts.push(end);
    start = end;
  }
  return framesBetween(cuts, input.totalFrames, input.fps);
}

// The chapter starts as cuts: inside the video, each moved to the nearest pause within 3 s,
// and at least one frame from the start, the end and each other.
export function chapterCuts(
  starts: readonly number[],
  points: readonly number[],
  total: number,
): readonly number[] {
  const snapped = starts
    .filter((start) => Number.isFinite(start))
    .map((start) => {
      const near = nearest(
        points.filter((point) => Math.abs(point - start) <= chapterSnapSeconds),
        start,
      );
      return near ?? start;
    })
    .filter((start) => start > 0 && start < total)
    .toSorted((left, right) => left - right);
  return snapped.filter((start, index) => index === 0 || start > (snapped[index - 1] ?? 0));
}

function nearest(values: readonly number[], target: number): number | undefined {
  let best: number | undefined;
  for (const value of values)
    if (best === undefined || Math.abs(value - target) < Math.abs(best - target)) best = value;
  return best;
}

// Cut times to whole frames. Two cuts that round to the same frame are one cut, so every shot
// is at least one frame, and the last shot runs to the end.
function framesBetween(cuts: readonly number[], totalFrames: number, fps: number): number[] {
  const marks: number[] = [];
  for (const cut of cuts) {
    const frame = Math.round(cut * fps);
    if (frame > (marks.at(-1) ?? 0) && frame < totalFrames) marks.push(frame);
  }
  const shots: number[] = [];
  let from = 0;
  for (const mark of [...marks, totalFrames]) {
    shots.push(mark - from);
    from = mark;
  }
  return shots.filter((frames) => frames > 0);
}

// The shots (0-based) the video and each chapter open on, as the render will cut them: what
// "Chapter openers" animates. The cuts before a chapter do not depend on how long the video
// runs after it, so the timeline is taken to end just past the last chapter.
export function chapterOpeningShots(input: {
  readonly fps: number;
  readonly imageSeconds: number;
  readonly narration: boolean;
  readonly cutPoints: readonly number[];
  readonly chapterStarts: readonly number[];
}): readonly number[] {
  const { fps, imageSeconds } = input;
  const last = Math.max(0, ...input.chapterStarts.filter((start) => Number.isFinite(start)));
  const totalFrames = Math.round((last + 1) * fps);
  if (!input.narration) {
    // Every N seconds does not move a chapter: the image on screen when it starts opens it.
    const each = Math.max(1, Math.round(imageSeconds * fps));
    return [
      ...new Set([
        0,
        ...input.chapterStarts
          .filter((start) => Number.isFinite(start) && start > 0)
          .map((start) => Math.floor(Math.round(start * fps) / each)),
      ]),
    ];
  }
  const starts = chapterStartFrames(input.chapterStarts, input.cutPoints, totalFrames, fps);
  const shots = narrationShotFrames({ ...input, totalFrames });
  const opening: number[] = [0];
  let frame = 0;
  for (const [index, frames] of shots.entries()) {
    if (starts.includes(frame) && index > 0) opening.push(index);
    frame += frames;
  }
  return opening;
}

// The frame each chapter's shot starts on, for the chapter cards and the chapter openers:
// the same snapping the cuts use, so a card appears with its shot.
export function chapterStartFrames(
  starts: readonly number[],
  points: readonly number[],
  totalFrames: number,
  fps: number,
): readonly number[] {
  return chapterCuts(starts, points, totalFrames / fps)
    .map((start) => Math.round(start * fps))
    .filter((frame) => frame > 0 && frame < totalFrames);
}
