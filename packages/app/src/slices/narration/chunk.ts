export const chunkModes = ["whole", "paragraph", "words", "characters"] as const;
export type ChunkMode = (typeof chunkModes)[number];

export interface Chunking {
  readonly mode: ChunkMode;
  // Only the `words` mode reads it.
  readonly words?: number | undefined;
  readonly characters?: number | undefined;
}

export const defaultChunkWords = 500;
export const defaultChunkCharacters = 3000;

// A run created before Play carried the control sends the whole text as one request,
// which is the first case and the one that adds nothing the user did not ask for.
export const defaultChunking: Chunking = { mode: "whole" };

// A run of blank lines is one paragraph break, not several, and a line of nothing but
// spaces between two paragraphs is still a break: strip-markdown output is full of both.
const paragraphBreak = /\r?\n[ \t\r]*(?:\r?\n[ \t\r]*)+/;

export function chunkNarration(text: string, chunking: Chunking): readonly string[] {
  switch (chunking.mode) {
    case "whole":
      return nonEmpty([text]);
    case "paragraph":
      return nonEmpty(text.split(paragraphBreak));
    case "words":
      return sentenceRuns(text, chunking.words ?? defaultChunkWords, wordsIn);
    case "characters":
      return sentenceRuns(
        text,
        chunking.characters ?? defaultChunkCharacters,
        (part) => Array.from(part.trim()).length,
      );
  }
}

// What "N words" counts: runs of non-space. Exported because it is half of the rule -
// a test that asserts a chunk fits in N has to count the same way the cut did.
export function wordsIn(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

export function sameChunking(left: Chunking | undefined, right: Chunking | undefined): boolean {
  const a = left ?? defaultChunking;
  const b = right ?? defaultChunking;
  if (a.mode !== b.mode) return false;
  if (a.mode === "words") return (a.words ?? defaultChunkWords) === (b.words ?? defaultChunkWords);
  if (a.mode === "characters")
    return (a.characters ?? defaultChunkCharacters) === (b.characters ?? defaultChunkCharacters);
  return true;
}

function sentenceRuns(
  text: string,
  budget: number,
  measure: (part: string) => number,
): readonly string[] {
  const limit = Math.max(1, Math.floor(budget));
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences(text)) {
    // Measure the joined text so spaces between sentences count toward a character budget.
    if (current.trim() && measure(current + sentence) > limit) {
      chunks.push(current);
      current = "";
    }
    current += sentence;
  }
  chunks.push(current);
  // Like word chunking, a sentence longer than the budget stays whole on its own.
  // The provider-specific planning layer applies any hard request limit afterwards.
  return nonEmpty(chunks);
}

// ceiling: segmented as English. `Intl.Segmenter` is the platform's own sentence breaker
// (ICU ships with Node), so no dependency and no regex full of abbreviations; the locale
// is fixed because a run carries no language and the default one varies by machine. The
// upgrade is a language on the run configuration, passed through to here.
function* sentences(text: string): Generator<string> {
  // Built per call rather than held at module scope: the standards forbid a module-level
  // singleton, and constructing one costs microseconds against a call that just read an
  // article off disk.
  const segmenter = new Intl.Segmenter("en", { granularity: "sentence" });
  for (const part of segmenter.segment(text)) {
    yield part.segment;
  }
}

function nonEmpty(parts: readonly string[]): readonly string[] {
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}
