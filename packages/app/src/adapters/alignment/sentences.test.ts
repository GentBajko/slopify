import { describe, expect, it } from "vitest";
import { sentencesOf, sentenceTiming, speechShape } from "./sentences.js";

// Seconds of tone and silence at 16 kHz.
function audio(parts: readonly (readonly ["speech" | "quiet", number])[]): Float32Array {
  const samples: number[] = [];
  for (const [kind, seconds] of parts)
    for (let index = 0; index < seconds * 16000; index += 1)
      samples.push(kind === "speech" ? 0.3 * Math.sin(index / 5) : 0.0005 * Math.sin(index));
  return Float32Array.from(samples);
}

describe("sentence timing fallback", () => {
  it("splits sentences with the language's own punctuation", () => {
    expect(sentencesOf("Привет. Как дела?", "ru")).toEqual(["Привет.", "Как дела?"]);
    expect(sentencesOf("今日は晴れです。明日は雨です。", "ja")).toEqual([
      "今日は晴れです。",
      "明日は雨です。",
    ]);
  });

  it("finds the speech and its pauses", () => {
    const shape = speechShape(
      audio([
        ["quiet", 0.5],
        ["speech", 1],
        ["quiet", 0.4],
        ["speech", 1],
        ["quiet", 0.5],
      ]),
    );
    expect(shape.speechStart).toBeCloseTo(0.5, 1);
    expect(shape.speechEnd).toBeCloseTo(2.9, 1);
    expect(shape.pauses).toHaveLength(1);
    expect(shape.pauses[0]?.start).toBeCloseTo(1.5, 1);
  });

  it("moves a sentence boundary to the pause the narration makes", () => {
    // The first sentence is much shorter in letters, but the speaker pauses halfway.
    const words = sentenceTiming("Да. Это очень длинное предложение.", "ru", {
      speechStart: 0,
      speechEnd: 4,
      pauses: [{ start: 1.4, end: 1.6 }],
    });
    expect(words.map((word) => word.text)).toEqual([
      "Да.",
      "Это",
      "очень",
      "длинное",
      "предложение.",
    ]);
    expect(words[0]).toMatchObject({ start: 0, end: 1.5 });
    expect(words[1]?.start).toBe(1.5);
    expect(words.at(-1)?.end).toBe(4);
  });

  it("spreads sentences by length when there is no pause nearby", () => {
    const words = sentenceTiming("Ab. Abcd.", "sv", { speechStart: 1, speechEnd: 4, pauses: [] });
    expect(words[0]).toMatchObject({ start: 1, end: 2 });
    expect(words[1]).toMatchObject({ start: 2, end: 4 });
  });

  it("keeps every word in order and inside the speech", () => {
    const words = sentenceTiming("一。二。三。", "zh", {
      speechStart: 0.2,
      speechEnd: 3,
      pauses: [{ start: 2.9, end: 2.95 }],
    });
    for (const [index, word] of words.entries()) {
      expect(word.end).toBeGreaterThan(word.start);
      expect(word.start).toBeGreaterThanOrEqual(words[index - 1]?.end ?? 0.2);
    }
  });
});
