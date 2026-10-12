import type { NarrationAlias } from "./narration-aliases.js";

// The English timing model, chosen per computer in Settings → Production defaults: the same
// pinned wav2vec2 conversion at three precisions. Bigger hears more accurately and, on most
// computers, also runs faster. The choice never enters a fingerprint: every precision times the
// same words, so switching must not mark finished subtitles outdated.
export const englishSubtitleModels = ["fp32", "fp16", "int8"] as const;
export type EnglishSubtitleModel = (typeof englishSubtitleModels)[number];
export const defaultEnglishSubtitleModel: EnglishSubtitleModel = "fp32";

export interface SubtitleOmission {
  readonly start: number;
  readonly text: string;
}
export interface TimedWord {
  readonly text: string;
  readonly start: number;
  readonly end: number;
  readonly confidence?: number | undefined;
}
export interface AlignmentRequest {
  readonly audioPath: string;
  readonly text: string;
  // Narration aliases the audio was read with: `text` holds the written words, the audio
  // says them as aliased. Absent or empty when the narration used none.
  readonly aliases?: readonly NarrationAlias[] | undefined;
  readonly cacheDir: string;
  readonly ffmpeg: string;
  readonly signal: AbortSignal;
  // The project language (`kernel/ports/languages.ts`); absent is English. It picks the model, and
  // a language no model can time is timed sentence by sentence.
  readonly language?: string | undefined;
  readonly onOmission?: (omission: SubtitleOmission) => void;
  readonly onProgress?: (current: number, total: number) => void;
}
export type SubtitleAligner = (request: AlignmentRequest) => Promise<readonly TimedWord[]>;

// Where the audio stopped matching its transcript: seconds into the aligned file, the
// transcript words it expected there and what the model heard instead (either may be empty).
// The aligner throws it so the caller can say which part of the narration to redo.
export class SubtitleMismatch extends Error {
  constructor(
    message: string,
    readonly at: number,
    readonly expected: string,
    readonly heard: string,
  ) {
    super(message);
    this.name = "SubtitleMismatch";
  }
}
