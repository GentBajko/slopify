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

// The chunks of an edited text, keeping the previous version's chunks wherever their text is
// still there unchanged: only the stretches between them are cut again. Cutting the whole text
// afresh packs sentences greedily from the start, so one sentence removed near the top moved
// every boundary after it and every chunk was voiced again (a 3,800-character edit re-voiced
// 113,000). `anchors` are the previous chunks in order; without them this is `chunkNarration`.
export function anchoredChunks(
  text: string,
  chunking: Chunking,
  anchors: readonly string[] | undefined,
): readonly string[] {
  if (anchors === undefined || anchors.length === 0) return chunkNarration(text, chunking);
  const chunks: string[] = [];
  let offset = 0;
  for (const anchor of anchors) {
    if (anchor === "") continue;
    const at = text.indexOf(anchor, offset);
    if (at < 0) continue;
    chunks.push(...chunkNarration(text.slice(offset, at), chunking), anchor);
    offset = at + anchor.length;
  }
  chunks.push(...chunkNarration(text.slice(offset), chunking));
  return chunks;
}

// What "N words" counts: runs of non-space. Exported because it is half of the rule -
// a test that asserts a chunk fits in N has to count the same way the cut did. Chinese,
// Japanese, Thai and the other scripts written without spaces are counted by the platform's
// own word breaker instead, or a whole paragraph would be one "word"; text without them
// (every English narration) is counted exactly as before.
const unspaced =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;
export function wordsIn(text: string): number {
  if (!unspaced.test(text)) return text.split(/\s+/).filter((word) => word !== "").length;
  const segmenter = new Intl.Segmenter("en", { granularity: "word" });
  let count = 0;
  for (const part of segmenter.segment(text)) if (part.isWordLike === true) count += 1;
  return count;
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

// `Intl.Segmenter` is the platform's own sentence breaker (ICU ships with Node), so no
// dependency and no regex full of abbreviations. Its sentence rules are Unicode's (UAX #29)
// for every language: "。", "！", "।", "؟" and "¿…?" end or open sentences whatever the
// locale, so the project language needs no locale here, and "en" keeps it the same on every
// machine (the default locale varies).
export function* sentences(text: string): Generator<string> {
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
