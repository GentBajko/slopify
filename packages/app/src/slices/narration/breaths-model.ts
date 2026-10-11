// Remove breaths. Some voices (Inworld's TTS-2 among them) take a loud, audible in-breath after
// almost every comma and full stop: about a third of a second, only 12 to 15 dB under the
// words. Switched on, the join finds those breaths in every narration piece and mutes them
// (`breaths.ts`, `breaths-detect.ts`): nothing is cut out, so every word and its timing stay
// exactly where they were, and the pauses between sentences (`pauses-model.ts`) are planned
// from the pieces as spoken just the same. It happens in the join, so the plain narration the
// word timing reads and the levelled one the video plays lose the same breaths.
//
// Browser-safe: Play and Edit project read it. Off is absent from the config, which is what
// every project saved before it was, and the joins keep their fingerprints then.

export function breathsOn(config: { readonly removeBreaths?: boolean | undefined }): boolean {
  return config.removeBreaths === true;
}

// Play's switch as a run's config holds it: only on is written.
export function breathsOfForm(form: { readonly removeBreaths?: boolean | undefined }): {
  readonly removeBreaths?: true;
} {
  return form.removeBreaths === true ? { removeBreaths: true } : {};
}
