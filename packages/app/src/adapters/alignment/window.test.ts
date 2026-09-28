import { describe, expect, it } from "vitest";
import { englishSpec } from "./spec.js";
import { speechWords } from "./text.js";
import { vocabulary } from "./vocabulary.js";
import { alignSpeechWindow, saidTheirWay } from "./window.js";

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

const before = "CANDIDATE FIVE HAD WET RING CELLS";
const after = "COMPARING CANDIDATE TWO WITH CANDIDATE FOUR SHOWED THE FLOODED FRAME DISAPPEARING";
const missing = "alongside an interior fraction of another percentage";
it("recovers an internal omission and reports its exact source span", () => {
  const audio = recording(`${before} ${after}`);
  const result = alignSpeechWindow(
    audio.logits,
    audio.frames,
    speechWords(`${before} ${missing} ${after}`),
    true,
    12,
    10,
  );
  expect(result.skipped).toBe(7);
  expect(result.omissionStart).toBe(6);
  expect(result.words.map((word) => word.text).join(" ")).toBe(`${before} ${after}`);
});
it("rejects internal recovery without budget or enough confirmed speech after it", () => {
  for (const [ending, budget] of [
    [after, 6],
    ["HI THERE", 10],
  ] as const) {
    const audio = recording(`${before} ${ending}`);
    expect(() =>
      alignSpeechWindow(
        audio.logits,
        audio.frames,
        speechWords(`${before} ${missing} ${ending}`),
        true,
        12,
        budget,
      ),
    ).toThrow(/match/);
  }
});
it("does not consume an internal omission whose following anchor is past the cutoff", () => {
  const audio = recording(`${before} ${after}`);
  expect(() =>
    alignSpeechWindow(
      audio.logits,
      audio.frames,
      speechWords(`${before} ${missing} ${after}`),
      true,
      1,
      10,
    ),
  ).toThrow(/match/);
});

it("keeps the spoken occurrence when a word repeats across an omission", () => {
  const prefix = "HAD ONE HUNDRED THIRTY THREE WET RING CELLS OR SIX POINT FIVE ONE PERCENT";
  const gap = "ALONGSIDE AN INTERIOR FRACTION OF SIX POINT FOUR FIVE PERCENT";
  const suffix = "COMPARING CANDIDATE TWO WITH CANDIDATE FOUR";
  const audio = recording(`${prefix} ${suffix}`);
  const result = alignSpeechWindow(
    audio.logits,
    audio.frames,
    speechWords(`${prefix} ${gap} ${suffix}`),
    true,
    12,
    20,
  );
  expect(result.omissionStart).toBe(speechWords(prefix).length);
  expect(result.skipped).toBe(speechWords(gap).length);
  expect(result.words.map((word) => word.text).join(" ")).toBe(`${prefix} ${suffix}`);
});

describe("words a voice says its own way", () => {
  const lead = "THE HIGH COUNCIL OF THE EASTERN PLATEAU";
  const tail = "RULED THE MOUNTAIN PASSES FOR MANY CENTURIES";
  it("places a short run the model hears differently between the words that hold it", () => {
    // Written as a name the model cannot spell, said as other letters.
    const audio = recording(`${lead} BLAT FROMP GRISH ${tail}`);
    const text = speechWords(`${lead} Quorvexx Maltheryon Zybranthus ${tail}`);
    const words = saidTheirWay(audio.logits, audio.frames, text, true, 12, englishSpec, true);
    expect(words?.map((word) => word.text)).toEqual(text.map((word) => word.text));
    // Every word in order, the run between its neighbours, the run marked as unsure.
    const times = words?.map((word) => word.start) ?? [];
    expect(times).toEqual([...times].sort((a, b) => a - b));
    const run = words?.filter((word) => word.confidence === 0).map((word) => word.text);
    expect(run?.length).toBeGreaterThan(0);
    expect(run?.every((word) => /Quorvexx|Maltheryon|Zybranthus/.test(word))).toBe(true);
  });

  it("leaves a run at the end of the window for the next window, which starts before it", () => {
    const audio = recording(`${lead} ${tail} BLAT FROMP`);
    const text = speechWords(`${lead} ${tail} Quorvexx Maltheryon`);
    const words = saidTheirWay(audio.logits, audio.frames, text, false, 12, englishSpec, true);
    expect(words?.map((word) => word.text).join(" ")).toBe(`${lead} ${tail}`);
  });

  it("still refuses other words, a long run, or a run with nothing holding it", () => {
    const other = recording("COMPLETELY DIFFERENT NARRATION WITH NO CORRESPONDING WORDS AT ALL");
    expect(
      saidTheirWay(
        other.logits,
        other.frames,
        speechWords(`${lead} ${tail}`),
        true,
        12,
        englishSpec,
        true,
      ),
    ).toBeUndefined();
    const long = "BLAT FROMP GRISH BLAT FROMP GRISH BLAT FROMP GRISH BLAT FROMP";
    const longText =
      "Quorvexx Maltheryon Zybranthus Quorvexx Maltheryon Zybranthus Quorvexx Maltheryon Zybranthus Quorvexx Maltheryon";
    const longAudio = recording(`${lead} ${long} ${tail}`);
    expect(
      saidTheirWay(
        longAudio.logits,
        longAudio.frames,
        speechWords(`${lead} ${longText} ${tail}`),
        true,
        12,
        englishSpec,
        true,
      ),
    ).toBeUndefined();
    // At the very start of the narration nothing before holds the run.
    const opening = recording(`BLAT FROMP ${lead} ${tail}`);
    expect(
      saidTheirWay(
        opening.logits,
        opening.frames,
        speechWords(`Quorvexx Maltheryon ${lead} ${tail}`),
        true,
        12,
        englishSpec,
        false,
      ),
    ).toBeUndefined();
  });
});
