// Pauses between sentences. Some voices (Inworld's TTS-2 among them) run one sentence into the
// next with barely a breath, so a narration sounds rushed. With a minimum set, the join finds
// the quiet after each sentence in every narration piece and lengthens it to at least that
// long by adding silence in the middle of it (`pauses.ts`): an existing pause is never
// shortened and a word is never cut. It happens in the join, before the word timing reads the
// narration, so the captions, the word-by-word highlights, the cuts, the shorts' clips, the
// chapters and the M4B's marks are timed on the paced narration and stay in step with it.
//
// A paragraph's minimum is separate and 0 (the sentence minimum only) unless set: the pause
// between paragraphs is mostly the narration prompt's and the voice's to make.
//
// Browser-safe: Play and Edit project read these limits. A run without either has neither on
// its config, which is what every project saved before them was, and the joins keep their
// fingerprints then.

// ceiling: a quarter second reads brisk, 0.35 to 0.45 natural or documentary, 0.5 to 0.8 an
// audiobook's relaxed pace, and above 0.8 sleep content; beyond 2 s it stops sounding like a
// pause between sentences.
export const defaultSentencePauseSeconds = 0.4;
export const pauseSecondsMax = 2;
export const pauseSecondsStep = 0.05;

export interface PauseSettings {
  readonly sentenceSeconds: number;
  readonly paragraphSeconds: number;
}

// What a run's config asks for; undefined when neither minimum is set.
export function pausesOf(config: {
  readonly sentencePauseSeconds?: number | undefined;
  readonly paragraphPauseSeconds?: number | undefined;
}): PauseSettings | undefined {
  const sentenceSeconds = config.sentencePauseSeconds ?? 0;
  const paragraphSeconds = config.paragraphPauseSeconds ?? 0;
  return sentenceSeconds > 0 || paragraphSeconds > 0
    ? { sentenceSeconds, paragraphSeconds }
    : undefined;
}

export function pauseProblem(value: number, name: string): string | undefined {
  const steps = value / pauseSecondsStep;
  return Number.isFinite(value) &&
    value >= 0 &&
    value <= pauseSecondsMax &&
    Math.abs(steps - Math.round(steps)) < 1e-6
    ? undefined
    : `The pause between ${name} must be between 0 and ${String(pauseSecondsMax)} seconds, in steps of ${String(pauseSecondsStep)}. Change it under Play → Outputs → Export, or Edit project → Pauses and volume.`;
}

export function pauseFields(config: {
  readonly sentencePauseSeconds?: number | undefined;
  readonly paragraphPauseSeconds?: number | undefined;
}): readonly { readonly field: string; readonly message: string }[] {
  const fields: { field: string; message: string }[] = [];
  if (config.sentencePauseSeconds !== undefined) {
    const problem = pauseProblem(config.sentencePauseSeconds, "sentences");
    if (problem !== undefined) fields.push({ field: "sentencePauseSeconds", message: problem });
  }
  if (config.paragraphPauseSeconds !== undefined) {
    const problem = pauseProblem(config.paragraphPauseSeconds, "paragraphs");
    if (problem !== undefined) fields.push({ field: "paragraphPauseSeconds", message: problem });
  }
  return fields;
}

// Play's typed pauses as a run's config holds them: absent text is the default (the sentence
// default, no paragraph minimum), a value of 0 is left off, and text that is not a number is
// NaN, which the rule refuses in place.
export function pausesOfForm(form: {
  readonly sentencePause?: string | undefined;
  readonly paragraphPause?: string | undefined;
}): { readonly sentencePauseSeconds?: number; readonly paragraphPauseSeconds?: number } {
  const typed = (raw: string | undefined, fallback: number): number =>
    raw === undefined || raw.trim() === "" ? fallback : Number(raw.trim().replace(",", "."));
  const sentence = typed(form.sentencePause, defaultSentencePauseSeconds);
  const paragraph = typed(form.paragraphPause, 0);
  return {
    ...(sentence === 0 ? {} : { sentencePauseSeconds: sentence }),
    ...(paragraph === 0 ? {} : { paragraphPauseSeconds: paragraph }),
  };
}
