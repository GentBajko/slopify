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
