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
  readonly cacheDir: string;
  readonly ffmpeg: string;
  readonly signal: AbortSignal;
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
