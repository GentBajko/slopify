// Soften breaths (the config keeps its first name, `removeBreaths`). Some voices (Inworld's
// TTS-2 among them) take a loud, audible in-breath after almost every comma and full stop:
// about a third of a second, only 12 to 15 dB under the words. Switched on, the join finds those
// breaths in every narration piece and turns them down 12 dB (`breaths.ts`, `breaths-detect.ts`),
// leaving alone any stretch with a word sound in it: nothing is cut out, so every word and its
// timing stay exactly where they were, and the pauses between sentences (`pauses-model.ts`) are
// planned from the pieces as spoken just the same. It happens in the join, so the plain narration
// the word timing reads and the levelled one the video plays lose the same breaths.
//
// Soften S sounds (`deEss`): each narration piece in the join goes through ffmpeg's de-esser,
// set very light (Gent approved these values by ear), after the breaths and before the pauses.
//
// Browser-safe: Play and Edit project read it. Off is absent from the config, which is what
// every project saved before them was, and the joins keep their fingerprints then.

export function breathsOn(config: { readonly removeBreaths?: boolean | undefined }): boolean {
  return config.removeBreaths === true;
}

// Play's switch as a run's config holds it: only on is written.
export function breathsOfForm(form: { readonly removeBreaths?: boolean | undefined }): {
  readonly removeBreaths?: true;
} {
  return form.removeBreaths === true ? { removeBreaths: true } : {};
}

// ffmpeg's `deesser` options: intensity, most de-essing, frequency (each 0 to 1).
export const deEsser = { intensity: 0.35, max: 0.5, frequency: 0.5 } as const;

export function deEssOn(config: { readonly deEss?: boolean | undefined }): boolean {
  return config.deEss === true;
}

// Play's switch as a run's config holds it: only on is written.
export function deEssOfForm(form: { readonly deEss?: boolean | undefined }): {
  readonly deEss?: true;
} {
  return form.deEss === true ? { deEss: true } : {};
}
