import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { TimedWord } from "../subtitles/model.js";

// The sample a preview is made of: six seconds of the bundled sample project's narration
// ("The Library of Alexandria", `assets/sample/sample-project.tar`) with the word timing its
// alignment found, and three of its images in each shape. Taken once, offline, from the body
// narration at 3.4 s (the video's 4.4 s, after its one second of edge silence); the words are
// on the clip's own timeline. Nothing here is generated at preview time.

export const sampleNarrationSeconds = 6;

export const sampleNarrationWords: readonly TimedWord[] = [
  { text: "Around", start: 0.5, end: 0.88 },
  { text: "three", start: 1.14, end: 1.36 },
  { text: "hundred", start: 1.46, end: 1.78 },
  { text: "years", start: 1.88, end: 2.26 },
  { text: "before", start: 2.4, end: 2.78 },
  { text: "our", start: 2.92, end: 3.02 },
  { text: "era,", start: 3.22, end: 3.4 },
  { text: "on", start: 4.18, end: 4.22 },
  { text: "the", start: 4.3, end: 4.36 },
  { text: "coast", start: 4.44, end: 4.72 },
  { text: "of", start: 4.84, end: 4.88 },
  { text: "Egypt,", start: 5.06, end: 5.4 },
];

export const sampleNarrationText = sampleNarrationWords.map((word) => word.text).join(" ");

// The sample project's title, the headline a Shorts preview shows when none is given.
export const sampleShortTitle = "The Library of Alexandria";

export interface SampleAssets {
  readonly narration: string;
  // Landscape for 16:9, portrait for 9:16, in the order they are shown.
  readonly wide: readonly string[];
  readonly tall: readonly string[];
}

export function bundledSampleAssets(
  dir = fileURLToPath(new URL("../../assets/style-preview/", import.meta.url)),
): SampleAssets {
  const at = (name: string): string => join(dir, name);
  return {
    narration: at("narration.mp3"),
    wide: [1, 2, 3].map((n) => at(`wide-${String(n)}.jpg`)),
    tall: [1, 2, 3].map((n) => at(`tall-${String(n)}.jpg`)),
  };
}
