import { describe, expect, it } from "vitest";
import { speechWords } from "./text.js";
import { vocabulary } from "./vocabulary.js";
import { alignSpeechWindow } from "./window.js";

function recording(text: string): { logits: Float32Array; frames: number } {
  const labels = [...text.replaceAll(" ", "|")].flatMap((letter) => [letter, "<pad>"]);
  return {
    frames: labels.length,
    logits: Float32Array.from(
      labels.flatMap((letter) =>
        Array.from({ length: 32 }, (_, id) => (id === vocabulary[letter] ? 8 : -8)),
      ),
    ),
  };
}
const spoken = "BOUND WHOLE DOMAIN COMPUTATION EXPLICITLY";
const expected = speechWords(`Unspoken passage goes here. ${spoken}`);

describe("bounded subtitle resynchronization", () => {
  it("recovers after an omitted passage using a strong acoustic anchor", () => {
    const { logits, frames } = recording(spoken);
    const result = alignSpeechWindow(logits, frames, expected, true, 12, 10);
    expect(result.skipped).toBe(4);
    expect(result.words.map((word) => word.text).join(" ")).toBe(spoken);
    expect(result.words[0]?.start).toBe(0);
  });
  it("never skips words on a matching recording", () => {
    const { logits, frames } = recording(spoken);
    expect(alignSpeechWindow(logits, frames, speechWords(spoken), true, 12, 10).skipped).toBe(0);
  });
  it("rejects a different recording, exhausted budgets and weak anchors", () => {
    const { logits, frames } = recording(spoken);
    for (const budget of [0, 3])
      expect(() => alignSpeechWindow(logits, frames, expected, true, 12, budget)).toThrow(/match/);
    expect(() =>
      alignSpeechWindow(
        logits,
        frames,
        speechWords("Completely different narration with no corresponding words"),
        true,
        12,
        40,
      ),
    ).toThrow(/match/);
    const short = recording("HI THERE");
    expect(() =>
      alignSpeechWindow(
        short.logits,
        short.frames,
        speechWords("Omitted text Hi there"),
        true,
        12,
        40,
      ),
    ).toThrow(/match/);
  });
  it("does not skip an extra spoken preamble", () => {
    const { logits, frames } = recording(`EXTRA WORDS ${spoken}`);
    expect(() => alignSpeechWindow(logits, frames, expected, true, 12, 40)).toThrow(/match/);
  });
});
