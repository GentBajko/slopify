import { describe, expect, it } from "vitest";
import { effectiveClips, type PickedShorts, pickedShortsOf, rangeProblem } from "./clips.js";
import type { ShortPick } from "./pick.js";

// Ten sentences of 9.5 s, half a second apart: sentence n runs (n-1)*10 to (n-1)*10+9.5.
const sentences = Array.from({ length: 10 }, (_value, at) => ({
  start: at * 10,
  end: at * 10 + 9.5,
  text: `Sentence ${String(at + 1)}.`,
}));
const clip = (number: number, first: number, last: number): ShortPick => ({
  number,
  first,
  last,
  start: (first - 1) * 10 - 0.25,
  end: (last - 1) * 10 + 9.75,
  title: `Short ${String(number)}`,
  description: "One line.",
  hashtags: ["#One"],
  why: "",
  text: "The model's clip.",
  seed: null,
});
const picked: PickedShorts = {
  shorts: [clip(1, 2, 3), clip(2, 6, 7)],
  durationSeconds: 100,
  sentences,
};
const limits = { minSeconds: 20, maxSeconds: 40 };

describe("hand-set ranges", () => {
  it("puts a range in place of the model's clip, keeping its title and words about it", () => {
    const clips = effectiveClips(picked, { "2": { first: 5, last: 7, pick: "p1" } }, "p1", limits);
    expect(clips[0]).toEqual(picked.shorts[0]);
    expect(clips[1]).toEqual({
      ...picked.shorts[1],
      first: 5,
      last: 7,
      start: 39.75,
      end: 69.75,
      text: "Sentence 5. Sentence 6. Sentence 7.",
    });
  });

  it("ignores a range set on another pick, and one that no longer fits", () => {
    expect(
      effectiveClips(picked, { "2": { first: 5, last: 7, pick: "older" } }, "p1", limits),
    ).toEqual(picked.shorts);
    // Sentences 2-3 are short 1's.
    expect(
      effectiveClips(picked, { "2": { first: 3, last: 5, pick: "p1" } }, "p1", limits),
    ).toEqual(picked.shorts);
    expect(effectiveClips(picked, undefined, "p1", limits)).toBe(picked.shorts);
  });

  it("says why a range can't be used, and what to do", () => {
    const problem = (number: number, first: number, last: number) =>
      rangeProblem(picked, number, first, last, limits, picked.shorts);
    expect(problem(2, 6, 8)).toBeUndefined();
    expect(problem(2, 6, 6)).toBe(
      "Short 2 would last 10 seconds, shorter than the 20-second minimum. Start it earlier or end it later.",
    );
    expect(problem(2, 5, 9)).toBe(
      "Short 2 would last 50 seconds, longer than the 40-second maximum. Start it later or end it earlier.",
    );
    expect(problem(2, 3, 5)).toBe(
      "Short 2 would share sentences with short 1 (sentences 2-3). Choose a range that doesn't overlap it.",
    );
    expect(problem(2, 8, 7)).toBe(
      "Choose a start sentence that comes before the end sentence, between 1 and 10.",
    );
    expect(problem(3, 8, 9)).toBe(
      "There is no short 3 any more. Reload the page and choose again.",
    );
    expect(rangeProblem({ shorts: picked.shorts }, 2, 6, 8, limits)).toBe(
      "These shorts were picked before clips could be adjusted by hand. Use Pick different moments, then adjust the new clips.",
    );
  });

  it("reads a pick's payload, old or new, and nothing else", () => {
    expect(pickedShortsOf(JSON.stringify(picked))).toEqual(picked);
    const { sentences: _sentences, durationSeconds: _duration, ...old } = picked;
    expect(pickedShortsOf(JSON.stringify(old))).toEqual(old);
    expect(pickedShortsOf("not json")).toBeUndefined();
    expect(pickedShortsOf(null)).toBeUndefined();
  });
});
