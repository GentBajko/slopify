import { z } from "zod";
import { clipBounds, type ShortPick, shortPickSchema } from "./pick.js";

// The clips the shorts are made from: the pick's answer, with any range the user set by hand
// in Edit project → Shorts in place of the model's. Pure and browser-safe: planning, the
// render and Edit project read the same clips.

export interface PickedSentence {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

// What the pick saves in its payload. `sentences` (the numbered transcript's times and
// words) came with hand-set ranges; a pick saved before them has none, and its clips can
// only be adjusted after the moments are picked again.
export const pickedShortsSchema = z.object({
  shorts: z.array(shortPickSchema),
  durationSeconds: z.number().finite().nonnegative().optional(),
  sentences: z
    .array(
      z.object({
        start: z.number().finite().nonnegative(),
        end: z.number().finite().nonnegative(),
        text: z.string(),
      }),
    )
    .optional(),
});
export interface PickedShorts {
  readonly shorts: readonly ShortPick[];
  readonly durationSeconds?: number | undefined;
  readonly sentences?: readonly PickedSentence[] | undefined;
}

export function pickedShortsOf(payload: string | null | undefined): PickedShorts | undefined {
  if (payload === null || payload === undefined) return undefined;
  try {
    const parsed = pickedShortsSchema.safeParse(JSON.parse(payload));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

// A range set by hand for short N, kept on the revision's content. `pick` is the
// fingerprint of the pick it was set against: once the moments are picked again it no
// longer applies, since short N may then be another clip.
export interface ShortRange {
  readonly first: number;
  readonly last: number;
  readonly pick: string;
}

export interface ClipLimits {
  readonly minSeconds: number;
  readonly maxSeconds: number;
}

// Why a hand-set range can't be used, in the words Edit project shows under the clip; or
// undefined when it can.
export function rangeProblem(
  picked: PickedShorts,
  number: number,
  first: number,
  last: number,
  limits: ClipLimits,
  others: readonly ShortPick[] = [],
): string | undefined {
  const sentences = picked.sentences;
  if (sentences === undefined || sentences.length === 0)
    return "These shorts were picked before clips could be adjusted by hand. Use Pick different moments, then adjust the new clips.";
  if (!picked.shorts.some((clip) => clip.number === number))
    return `There is no short ${String(number)} any more. Reload the page and choose again.`;
  if (
    !Number.isInteger(first) ||
    !Number.isInteger(last) ||
    first < 1 ||
    last > sentences.length ||
    first > last
  )
    return `Choose a start sentence that comes before the end sentence, between 1 and ${String(sentences.length)}.`;
  const bounds = clipBounds(sentences, first, last, durationOf(picked));
  if (bounds === undefined) return "Choose a start and an end sentence from the transcript.";
  const seconds = bounds.end - bounds.start;
  // The same hundredth-of-a-second allowance the pick is checked with.
  if (seconds < limits.minSeconds - 0.01)
    return `Short ${String(number)} would last ${String(Math.round(seconds))} seconds, shorter than the ${String(limits.minSeconds)}-second minimum. Start it earlier or end it later.`;
  if (seconds > limits.maxSeconds + 0.01)
    return `Short ${String(number)} would last ${String(Math.round(seconds))} seconds, longer than the ${String(limits.maxSeconds)}-second maximum. Start it later or end it earlier.`;
  const clash = others.find(
    (clip) => clip.number !== number && first <= clip.last && last >= clip.first,
  );
  if (clash !== undefined)
    return `Short ${String(number)} would share sentences with short ${String(clash.number)} (sentences ${String(clash.first)}-${String(clash.last)}). Choose a range that doesn't overlap it.`;
  return undefined;
}

// The picked clips with every usable hand-set range in place: the model's title,
// description and hashtags stay, the sentences, times and words are the range's. A range
// set against another pick, or one that no longer fits the limits, is left out.
export function effectiveClips(
  picked: PickedShorts,
  ranges: Readonly<Record<string, ShortRange>> | undefined,
  pick: string,
  limits: ClipLimits,
): readonly ShortPick[] {
  const sentences = picked.sentences;
  if (ranges === undefined || sentences === undefined) return picked.shorts;
  const clips = [...picked.shorts];
  for (const [at, clip] of clips.entries()) {
    const range = ranges[String(clip.number)];
    if (range === undefined || range.pick !== pick) continue;
    if (rangeProblem(picked, clip.number, range.first, range.last, limits, clips) !== undefined)
      continue;
    const bounds = clipBounds(sentences, range.first, range.last, durationOf(picked));
    if (bounds === undefined) continue;
    clips[at] = {
      ...clip,
      first: range.first,
      last: range.last,
      start: bounds.start,
      end: bounds.end,
      text: sentences
        .slice(range.first - 1, range.last)
        .map((sentence) => sentence.text)
        .join(" "),
    };
  }
  return clips;
}

function durationOf(picked: PickedShorts): number {
  return picked.durationSeconds ?? picked.sentences?.at(-1)?.end ?? 0;
}
