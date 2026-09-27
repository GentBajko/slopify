import type { NarrationAlias } from "../../kernel/ports/narration-aliases.js";
import { respoken, type SpeechWord, speechWords } from "./text.js";
import { letters as englishLetters, vocabulary as englishVocabulary } from "./vocabulary.js";

// The thresholds a window must pass before its timing is kept. They were tuned on one model;
// a different model's posteriors behave differently, so each model carries its own.
export interface AlignmentGates {
  // Mean per-word posterior of a window.
  readonly meanPosterior: number;
  // A word below this posterior is "poor"; no more than `poorShare` of a window may be.
  readonly poorScore: number;
  readonly poorShare: number;
  // Edit distance between greedy speech and the transcript, as a share of the longer one.
  readonly maximumError: number;
  // Omission recovery: anchors of at least this many letters, each word this confident.
  readonly anchorLetters: number;
  readonly anchorConfidence: number;
}

// Everything the CTC aligner needs to know about one model and one language. English passes
// today's constants unchanged (`englishSpec`), so its timing is byte-for-byte what it was.
export interface AlignmentSpec {
  // Labels per frame of the logits the aligner works on (after `compact`, when there is one).
  readonly labels: number;
  // Label 0 is always the CTC blank; this is the word delimiter.
  readonly delimiter: number;
  // Transcript letter → label.
  readonly ids: Readonly<Record<string, number>>;
  // Label → the letter greedy decoding writes (" " for the delimiter, "" for specials).
  readonly letters: readonly string[];
  // Labels per frame the ONNX model itself returns.
  readonly modelLabels: number;
  // Folds the model's logits into `labels` columns (for example the multilingual model's
  // 9,913 labels into one language's alphabet). Absent: used as they are.
  readonly compact?: ((logits: Float32Array, frames: number) => Float32Array) | undefined;
  readonly words: (
    text: string,
    observed?: string,
    aliases?: readonly NarrationAlias[],
  ) => readonly SpeechWord[];
  // The form of a word the recording seems to say (`text.ts#respoken`).
  readonly respoken: (word: SpeechWord, observed: string) => SpeechWord;
  // Only the letters of a text, for counting and anchors.
  readonly lettersOnly: (text: string) => string;
  // Letters plus whatever else the transcript keeps (the English apostrophe), for comparing
  // the transcript with what was heard.
  readonly comparable: (text: string) => string;
  readonly gates: AlignmentGates;
  readonly mismatch: string;
}

export const englishMismatch =
  "The audio does not closely match the English transcript. Check the article and audio, including any intro or outro, before generating subtitles.";

export const englishGates: AlignmentGates = {
  meanPosterior: 0.48,
  poorScore: 0.2,
  poorShare: 0.3,
  maximumError: 0.42,
  anchorLetters: 20,
  anchorConfidence: 0.75,
};

export const englishSpec: AlignmentSpec = {
  labels: 32,
  delimiter: 4,
  ids: englishVocabulary,
  letters: englishLetters,
  modelLabels: 32,
  words: speechWords,
  respoken,
  lettersOnly: (text) => text.replace(/[^A-Z]/g, ""),
  comparable: (text) => text.toUpperCase().replace(/[^A-Z']/g, ""),
  gates: englishGates,
  mismatch: englishMismatch,
};
