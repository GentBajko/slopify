// The run's chunking choice: whole text is one request, per paragraph is one request per
// paragraph, and every ~N words is consecutive chunks each ending at the last sentence
// boundary at or before N words, N defaulting to 500.
//
// Pure, and the only place the rule lives. Chunking sits in the functional core beside
// substitution and the render plan, so it is testable with no I/O and `run.ts` does nothing
// but call it.

export const chunkModes = ["whole", "paragraph", "words"] as const;
export type ChunkMode = (typeof chunkModes)[number];

export interface Chunking {
  readonly mode: ChunkMode;
  // Only the `words` mode reads it.
  readonly words?: number | undefined;
}

export const defaultChunkWords = 500;

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
      return wordRuns(text, chunking.words ?? defaultChunkWords);
  }
}

// What "N words" counts: runs of non-space. Exported because it is half of the rule -
// a test that asserts a chunk fits in N has to count the same way the cut did.
export function wordsIn(text: string): number {
  return text.split(/\s+/).filter((word) => word !== "").length;
}

function wordRuns(text: string, budget: number): readonly string[] {
  // A budget below one word would end every chunk before it started; one sentence is the
  // floor because the rule never cuts inside a sentence.
  const limit = Math.max(1, Math.floor(budget));
  const chunks: string[] = [];
  let current = "";
  let count = 0;

  for (const sentence of sentences(text)) {
    const words = wordsIn(sentence);
    // The last sentence boundary at or before N words: the sentence that would push the count
    // past the budget starts the next chunk instead of being split.
    if (count > 0 && count + words > limit) {
      chunks.push(current);
      current = "";
      count = 0;
    }
    current += sentence;
    count += words;
  }
  chunks.push(current);
  // A single sentence longer than the budget lands here whole, on its own: a cut inside a
  // clause would be an audible pause the writer never wrote. The provider's own per-request
  // limit is what refuses it, as an error on the stage.
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
