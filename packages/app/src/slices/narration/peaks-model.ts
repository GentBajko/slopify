// The live view's narration waveform as the browser receives it. Browser-safe.
export interface NarrationPeaks {
  readonly revisionId: string;
  // True once the joined or uploaded narration is what `pieces` holds.
  readonly complete: boolean;
  readonly pieces: readonly {
    readonly key: string;
    readonly seconds: number;
    readonly peaks: readonly number[];
  }[];
}
