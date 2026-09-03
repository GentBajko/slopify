import { describe, expect, it } from "vitest";
import type { Chunking } from "./chunk.js";
import { chunkNarration, defaultChunkWords, wordsIn } from "./chunk.js";

// The whole chunking rule: whole text is one request, per paragraph is one request per
// paragraph, and every ~N words is consecutive chunks each ending at the last sentence
// boundary at or before N words, N defaulting to 500.

const article = [
  "Rope is older than writing.",
  "",
  "The oldest fragment found is two-ply, twisted from plant fibre. It was made by hand.",
  "",
  "",
  "   ",
  "Modern rope is laid or braided; the difference decides how it stretches.",
].join("\n");

// A sentence of exactly `count` words, distinguishable from its neighbours. It starts
// with a capital because that is what a sentence looks like: a full stop followed by a
// lower-case word is a decimal or an abbreviation to any sentence breaker, ICU's
// included, and would not be a boundary in real prose either.
function words(count: number, sentence = 1): string {
  const middle = Array.from({ length: count - 2 }, (_at, n) => `w${String(sentence)}x${String(n)}`);
  return [`S${String(sentence)}`, ...middle, `end${String(sentence)}.`].join(" ");
}

describe("chunkNarration, whole", () => {
  it("sends the whole text as one request", () => {
    expect(chunkNarration(article, { mode: "whole" })).toEqual([article.trim()]);
  });

  it("sends nothing when there is nothing to narrate", () => {
    expect(chunkNarration("   \n\n  ", { mode: "whole" })).toEqual([]);
  });
});

describe("chunkNarration, per paragraph", () => {
  it("sends one request per paragraph", () => {
    expect(chunkNarration(article, { mode: "paragraph" })).toEqual([
      "Rope is older than writing.",
      "The oldest fragment found is two-ply, twisted from plant fibre. It was made by hand.",
      "Modern rope is laid or braided; the difference decides how it stretches.",
    ]);
  });

  // A model's markdown-stripped output is full of runs of blank lines, and a
  // whitespace-only line between two paragraphs is still one break, not two.
  it("treats a run of blank lines as one break and never sends an empty chunk", () => {
    const spaced = "One.\n\n\n\nTwo.\n \t \nThree.\n\n";

    expect(chunkNarration(spaced, { mode: "paragraph" })).toEqual(["One.", "Two.", "Three."]);
  });

  it("sends one request for a single paragraph", () => {
    expect(chunkNarration("Just the one.", { mode: "paragraph" })).toEqual(["Just the one."]);
  });

  it("sends nothing when there is nothing to narrate", () => {
    expect(chunkNarration("\n\n\n", { mode: "paragraph" })).toEqual([]);
  });
});

describe("chunkNarration, every ~N words", () => {
  it("sends one request when the text is shorter than N", () => {
    const short = "Rope is older than writing. It is also stronger than it looks.";

    expect(chunkNarration(short, { mode: "words", words: 500 })).toEqual([short]);
  });

  // The rule the whole mode exists for: the cut lands on the last sentence that fits,
  // never inside one.
  it("ends each chunk at the last sentence boundary at or before N words", () => {
    const text = [words(4, 1), words(4, 2), words(4, 3), words(4, 4)].join(" ");

    const chunks = chunkNarration(text, { mode: "words", words: 10 });

    // Two sentences of four words fit in ten; a third would make twelve.
    expect(chunks).toEqual([`${words(4, 1)} ${words(4, 2)}`, `${words(4, 3)} ${words(4, 4)}`]);
    for (const chunk of chunks) {
      expect(wordsIn(chunk)).toBeLessThanOrEqual(10);
    }
  });

  it("keeps a sentence that would exactly fill the budget in the chunk it started", () => {
    const text = [words(5, 1), words(5, 2), words(5, 3)].join(" ");

    expect(chunkNarration(text, { mode: "words", words: 10 })).toEqual([
      `${words(5, 1)} ${words(5, 2)}`,
      words(5, 3),
    ]);
  });

  // Nothing caps a sentence and the rule never splits one, so an unbroken sentence longer
  // than N is sent whole and the provider's own limit decides. Splitting it would put a
  // TTS pause in the middle of a clause.
  it("sends a single sentence longer than N as one over-long chunk", () => {
    const long = words(25, 1);

    const chunks = chunkNarration(long, { mode: "words", words: 10 });

    expect(chunks).toEqual([long]);
    expect(wordsIn(chunks[0] ?? "")).toBe(25);
  });

  it("gives an over-long sentence a chunk of its own rather than dragging its neighbours", () => {
    const text = [words(3, 1), words(25, 2), words(3, 3)].join(" ");

    expect(chunkNarration(text, { mode: "words", words: 10 })).toEqual([
      words(3, 1),
      words(25, 2),
      words(3, 3),
    ]);
  });

  it("counts 500 words when the run named no number", () => {
    expect(defaultChunkWords).toBe(500);
    const text = Array.from({ length: 200 }, (_at, n) => words(4, n + 1)).join(" ");

    const chunks = chunkNarration(text, { mode: "words" });

    // 800 words of four-word sentences at 500 to a chunk: 125 sentences, then the rest.
    expect(chunks).toHaveLength(2);
    expect(wordsIn(chunks[0] ?? "")).toBe(500);
    expect(wordsIn(chunks[1] ?? "")).toBe(300);
  });

  it("keeps every word of the source, in order", () => {
    const chunks = chunkNarration(article, { mode: "words", words: 6 });

    expect(chunks.join(" ").split(/\s+/)).toEqual(article.trim().split(/\s+/));
  });

  it("sends nothing when there is nothing to narrate", () => {
    expect(chunkNarration("  \n ", { mode: "words", words: 10 })).toEqual([]);
  });

  it("refuses a budget below one word rather than looping", () => {
    const nonsense: Chunking = { mode: "words", words: 0 };

    expect(chunkNarration("One. Two.", nonsense)).toEqual(["One.", "Two."]);
  });
});

describe("wordsIn", () => {
  it("counts runs of non-space, ignoring the space around them", () => {
    expect(wordsIn("  one   two\nthree \t four ")).toBe(4);
    expect(wordsIn("   ")).toBe(0);
  });
});
