import { languageInfo, wordTimingUnavailable } from "@app/kernel/ports/languages.js";
import type { EnglishSubtitleModel } from "@app/kernel/ports/subtitles.js";

// The caption-timing model each language downloads the first time it makes captions, in bytes.
// The same files `adapters/alignment` fetches (cache.ts and multilingual.ts); model-facts.test.ts
// fails when either changes, so these words never drift from the real download. English is the
// default of Settings → Production defaults → Subtitle timing model.
export const englishModelBytes = 377_887_594;
export const multilingualModelBytes = 247_576_761;

// Settings → Production defaults → Subtitle timing model: the English model at three
// precisions, most accurate first (`adapters/alignment/cache.ts#englishModels`).
const fp16Bytes = 189_192_204;
const int8Bytes = 95_286_046;
export const englishModelChoices: readonly {
  readonly value: EnglishSubtitleModel;
  readonly bytes: number;
  readonly label: string;
}[] = [
  {
    value: "fp32",
    bytes: englishModelBytes,
    label: `Most accurate (${megabytes(englishModelBytes)}, recommended)`,
  },
  { value: "fp16", bytes: fp16Bytes, label: `Balanced (${megabytes(fp16Bytes)})` },
  { value: "int8", bytes: int8Bytes, label: `Smallest (${megabytes(int8Bytes)}, less accurate)` },
];

function megabytes(bytes: number): string {
  return `${String(Math.round(bytes / 1_000_000))} MB`;
}

// The short tag beside the Captions select and the sentence under it, for the project's
// language: which model times the captions, and what its first use downloads.
export function subtitleFacts(code: string | undefined): {
  readonly tag: string;
  readonly detail: string;
} {
  const language = languageInfo(code);
  if (language.timing === "english")
    return {
      tag: "English · local · no paid API",
      detail: `Timed from your narration on this computer. The first English captions download the speech model chosen in Settings → Production defaults (${megabytes(englishModelBytes)} unless changed). Check the captions before you publish.`,
    };
  if (language.timing === "multilingual")
    return {
      tag: `${language.name} · local · no paid API`,
      detail: `Timed word by word from your narration on this computer. The first ${language.name} captions download a ${megabytes(multilingualModelBytes)} multilingual speech model. Check the captions before you publish.`,
    };
  return {
    tag: `${language.name} · by sentence · no paid API`,
    detail: `${wordTimingUnavailable(language.code) ?? ""} Nothing is downloaded. Check the captions before you publish.`,
  };
}
