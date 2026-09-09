import { describe, expect, it } from "vitest";
import { alignWindow } from "./ctc.js";
import { vocabulary } from "./vocabulary.js";

function emissions(sequence: readonly string[]): Float32Array {
  return Float32Array.from(
    sequence.flatMap((char) =>
      Array.from({ length: 32 }, (_, id) => (id === vocabulary[char] ? 8 : -8)),
    ),
  );
}

describe("CTC forced alignment", () => {
  it("finds actual word positions across silence and preserves exact text", () => {
    const logits = emissions([
      "<pad>",
      "H",
      "<pad>",
      "I",
      "|",
      "<pad>",
      "B",
      "<pad>",
      "Y",
      "<pad>",
      "E",
      "<pad>",
    ]);
    const result = alignWindow(
      logits,
      12,
      [
        { text: "Hi,", spoken: "HI" },
        { text: "bye!", spoken: "BYE" },
      ],
      true,
    );
    expect(result.words).toMatchObject([
      { text: "Hi,", start: 0.02, end: 0.08 },
      { text: "bye!", start: 0.12, end: 0.22 },
    ]);
    expect(result.words.every((word) => (word.confidence ?? 0) > 0.99)).toBe(true);
  });
  it("requires a blank between repeated CTC letters", () => {
    const logits = emissions(["O", "<pad>", "O", "<pad>"]);
    const result = alignWindow(logits, 4, [{ text: "oo", spoken: "OO" }], true);
    expect(result.words[0]).toMatchObject({ text: "oo", start: 0, end: 0.06 });
  });
  it("can align a prefix of a long transcript without forcing unseen words into the window", () => {
    const logits = emissions(["H", "<pad>", "I", "|", "<pad>"]);
    const result = alignWindow(
      logits,
      5,
      [
        { text: "Hi", spoken: "HI" },
        { text: "tomorrow", spoken: "TOMORROW" },
      ],
      false,
    );
    expect(result.words).toHaveLength(1);
    expect(result.words[0]?.text).toBe("Hi");
  });
  it("rejects an audio/transcript mismatch", () => {
    const logits = emissions(["C", "<pad>", "A", "<pad>", "T", "<pad>"]);
    expect(() => alignWindow(logits, 6, [{ text: "dog", spoken: "DOG" }], true)).toThrow(/match/);
  });
  it("refuses an oversized window before allocating a large table", () => {
    expect(() => alignWindow(new Float32Array(0), 2000, [], true)).toThrow(/window/);
  });
});
