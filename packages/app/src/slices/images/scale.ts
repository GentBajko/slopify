import type { ImagePromptChoice, RunDraft } from "../admission/model.js";
import { imagesPerRunMax } from "../admission/rules.js";

// More images for long videos: "an image every N minutes" or "N images per hour" of
// narration. The run keeps one form, images per hour (`RunDraft.imageScale`); every N
// minutes is 60 / N of them.
//
// The count is planned once, when the run starts, from the narration length the run expects:
// a provided article's own words, otherwise Play's expected words (Review), both read at
// 150 spoken words a minute, the estimate's own assumption. It is not recounted from the
// narration once it is made: every image is its own step in the project's revision (shown,
// regenerated and deleted one by one) and they start at once, beside the narration, so
// waiting for the narration would hold every picture back for the length of the whole TTS.
// A narration that comes out longer than expected is still covered, because the slideshow
// cycles its images until the video ends. Planned once and kept in the revision, a retry or
// a rebuild makes the same images and never re-plans them.
//
// Each ticked prompt keeps its own Number as a floor; the images the length asks for on top
// are handed to the ticked prompts one at a time, in prompt order.

export interface ImageScale {
  // Images per hour of narration, `imagesPerHourMin` to `imagesPerHourMax`.
  readonly perHour: number;
  // The narration length, in words, the count is planned for.
  readonly words: number;
}

// ceiling: one image an hour is the least that still scales; one every 15 seconds is the
// most, which is already as fast as the default Seconds per image shows them.
export const imagesPerHourMin = 1;
export const imagesPerHourMax = 240;
// "Every N minutes" spells the same range.
export const everyMinutesMin = 60 / imagesPerHourMax;
export const everyMinutesMax = 60 / imagesPerHourMin;
// ceiling: a hand-set run stops at `imagesPerRunMax` (60), which is one image every two
// minutes of a two-hour video. A scaled run may plan up to 240, four hours at one a minute:
// the images are drawn a few at a time under the image provider's own rate limits and the
// render joins its clips one at a time, so the count costs time and money, both of which the
// estimate shows before the run starts, rather than anything breaking. Past 240 the count is
// capped and Play says so.
export const scaledImagesMax = 240;
export const expectedWordsMax = 100000;
// Play's starting expected words (Review).
export const defaultExpectedWords = 1500;
// The estimate's own assumption (`estimate/requests.ts`).
export const spokenWordsPerMinute = 150;

// How many images a project's revision may hold: a scaled run's cap, else the hand-set one.
export function imagesPerVideoMax(config: Pick<RunDraft, "imageScale">): number {
  return config.imageScale === undefined ? imagesPerRunMax : scaledImagesMax;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

export function narrationMinutes(words: number): number {
  return words / spokenWordsPerMinute;
}

// Images per hour, rounded to four places so "every 7 minutes" is stored as a plain number
// that reads back as 7.
export function perHourFromMinutes(minutes: number): number {
  return Math.round((60 / minutes) * 10000) / 10000;
}

// The setting as Play's control spells it: "every N minutes" when N is a whole or a quarter
// minute, else "N per hour".
export function imageScaleForm(scale: ImageScale): {
  readonly every: "minutes" | "hour";
  readonly value: string;
} {
  const minutes = 60 / scale.perHour;
  const quarters = Math.round(minutes * 4);
  return Math.abs(minutes * 4 - quarters) < 0.001
    ? { every: "minutes", value: String(quarters / 4) }
    : { every: "hour", value: String(scale.perHour) };
}

// What the length asks for, before the prompts' own Numbers are counted: one image per
// started stretch, capped at `scaledImagesMax`.
export function scaledTarget(scale: ImageScale): number {
  // The small epsilon keeps a length that is exactly a whole number of stretches (a rounded
  // 60 / 7) from asking for one more.
  const exact = (narrationMinutes(scale.words) * scale.perHour) / 60;
  return Math.min(Math.max(Math.ceil(exact - 1e-9), 0), scaledImagesMax);
}

// Whether the run scales its images: set, and the images are generated from prompts.
export function scalesImages(
  draft: Pick<RunDraft, "imageScale" | "sources">,
): draft is Pick<RunDraft, "sources"> & { readonly imageScale: ImageScale } {
  return draft.imageScale !== undefined && draft.sources.images === "generate";
}

// How many images each ticked prompt makes, in prompt order. Without the setting it is each
// prompt's Number, exactly as before it existed.
export function imageCountsOf(
  draft: Pick<RunDraft, "imagePrompts" | "imageScale" | "sources">,
): readonly number[] {
  const counts = draft.imagePrompts.map((prompt: ImagePromptChoice) => prompt.number);
  if (!scalesImages(draft) || counts.length === 0) return counts;
  const floor = counts.reduce((sum, count) => sum + count, 0);
  const extra = scaledTarget(draft.imageScale) - floor;
  for (let at = 0; at < extra; at += 1) {
    const index = at % counts.length;
    counts[index] = (counts[index] ?? 0) + 1;
  }
  return counts;
}

// The images the run makes from its prompts.
export function plannedImageCount(
  draft: Pick<RunDraft, "imagePrompts" | "imageScale" | "sources">,
): number {
  return imageCountsOf(draft).reduce((sum, count) => sum + count, 0);
}

// Admission's sentence for a stored setting out of range; Play's control says the same.
export function imageScaleProblem(scale: ImageScale): string | undefined {
  if (
    !Number.isFinite(scale.perHour) ||
    scale.perHour < imagesPerHourMin ||
    scale.perHour > imagesPerHourMax
  )
    return `Enter between ${String(imagesPerHourMin)} and ${String(imagesPerHourMax)} images per hour (one every ${String(everyMinutesMin)} to ${String(everyMinutesMax)} minutes) under Images → More images for long videos.`;
  if (!Number.isInteger(scale.words) || scale.words < 1 || scale.words > expectedWordsMax)
    return `Enter the expected words (Review) as a whole number between 1 and ${String(expectedWordsMax)}; the image count for long videos is planned from it.`;
  return undefined;
}
