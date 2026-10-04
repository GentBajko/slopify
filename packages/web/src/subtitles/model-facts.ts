import { languageInfo, wordTimingUnavailable } from "@app/kernel/ports/languages.js";

// The caption-timing model each language downloads the first time it makes captions, in bytes.
// The same files `adapters/alignment` fetches (cache.ts and multilingual.ts); model-facts.test.ts
// fails when either changes, so these words never drift from the real download.
export const englishModelBytes = 95_286_046;
export const multilingualModelBytes = 247_576_761;

function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / 1_000_000))} MB`;
}

// The short tag beside the Subtitles select and the sentence under it, for the project's
// language: which model times the captions, and what its first use downloads.
export function subtitleFacts(code: string | undefined): {
  readonly tag: string;
  readonly detail: string;
} {
  const language = languageInfo(code);
  if (language.timing === "english")
    return {
      tag: "English · local · no paid API",
      detail: `Timed from your narration on this computer. The first English captions download a ${megabytes(englishModelBytes)} speech model. Review the subtitles before publishing.`,
    };
  if (language.timing === "multilingual")
    return {
      tag: `${language.name} · local · no paid API`,
      detail: `Timed word by word from your narration on this computer. The first ${language.name} captions download a ${megabytes(multilingualModelBytes)} multilingual speech model. Review the subtitles before publishing.`,
    };
  return {
    tag: `${language.name} · by sentence · no paid API`,
    detail: `${wordTimingUnavailable(language.code) ?? ""} Nothing is downloaded. Review the subtitles before publishing.`,
  };
}
