import { describe, expect, it } from "vitest";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import {
  chapterCuts,
  chapterOpeningShots,
  narrationShotFrames,
  sentenceCutPoints,
} from "./cuts.js";

const fps = 30;

// Sentences of `lengths` seconds, one word a second, with `pause` seconds between them,
// starting at `from`.
function narration(lengths: readonly number[], pause = 0.5, from = 0): TimedWord[] {
  const words: TimedWord[] = [];
  let at = from;
  for (const length of lengths) {
    for (let word = 0; word < length; word += 1) {
      words.push({ text: word === length - 1 ? "end." : "word", start: at, end: at + 0.9 });
      at += 1;
    }
    at += pause - 0.1;
  }
  return words;
}

// Where each shot starts, in seconds.
function starts(frames: readonly number[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const shot of frames) {
    out.push(at / fps);
    at += shot;
  }
  return out;
}

describe("sentenceCutPoints", () => {
  it("cuts halfway through the pause after each sentence but the last", () => {
    // Sentences of 3 and 4 words with 0.5 s between: the first ends at 2.9, the second
    // starts at 3.4.
    expect(sentenceCutPoints(narration([3, 4]))).toEqual([3.15]);
  });

  it("never waits more than a quarter second into a long pause", () => {
    expect(sentenceCutPoints(narration([2, 2], 3))).toEqual([2.15]);
  });

  it("finds nothing to cut in a single sentence", () => {
    expect(sentenceCutPoints(narration([5]))).toEqual([]);
    expect(sentenceCutPoints([])).toEqual([]);
  });
});

describe("narrationShotFrames", () => {
  const plan = (input: {
    readonly seconds: number;
    readonly imageSeconds: number;
    readonly cutPoints: readonly number[];
    readonly chapterStarts?: readonly number[];
  }) =>
    narrationShotFrames({
      totalFrames: Math.round(input.seconds * fps),
      fps,
      imageSeconds: input.imageSeconds,
      cutPoints: input.cutPoints,
      chapterStarts: input.chapterStarts ?? [],
    });

  it("adds up to the whole timeline, frame for frame", () => {
    for (const seconds of [1, 9.99, 60, 61.37, 3600]) {
      const frames = plan({ seconds, imageSeconds: 10, cutPoints: [3.2, 11.1, 19.7, 33, 41] });
      expect(frames.reduce((sum, one) => sum + one, 0)).toBe(Math.round(seconds * fps));
      expect(frames.every((one) => one >= 1 && Number.isInteger(one))).toBe(true);
    }
  });

  it("snaps each cut to the sentence pause nearest the target length", () => {
    // Targets at 10 s: the pause at 9.2 is nearer than 12; then from 9.2 the target is 19.2
    // and 20.5 is nearest; the rest (under 14 s) is one shot.
    const frames = plan({ seconds: 30, imageSeconds: 10, cutPoints: [5, 9.2, 12, 20.5, 25] });
    expect(starts(frames)).toEqual([0, 9.2, 20.5]);
  });

  it("never cuts closer than 40% of the target to the cut before", () => {
    // 3.5 s is nearest to 10 after 0 only if nothing else is; it sits under the 4 s floor.
    const frames = plan({ seconds: 20, imageSeconds: 10, cutPoints: [3.5, 17] });
    expect(starts(frames)).toEqual([0, 10]);
  });

  it("cuts at the target where no sentence ends in reach, as Every N seconds would", () => {
    // The last 15 s is more than a shot and a floor, so it splits 10 and 5; 14 s would not.
    const frames = plan({ seconds: 45, imageSeconds: 10, cutPoints: [] });
    expect(starts(frames)).toEqual([0, 10, 20, 30, 40]);
    expect(frames.at(-1)).toBe(5 * fps);
    expect(plan({ seconds: 44, imageSeconds: 10, cutPoints: [] }).at(-1)).toBe(14 * fps);
  });

  it("does not look for a pause further than twice the target", () => {
    const frames = plan({ seconds: 60, imageSeconds: 10, cutPoints: [25] });
    expect(starts(frames)[1]).toBe(10);
  });

  it("gives what is too short for a full shot and a floor to the last shot", () => {
    // 13 s left after nothing: under 10 + 4, so one shot of 13 s.
    expect(plan({ seconds: 13, imageSeconds: 10, cutPoints: [6] })).toEqual([13 * fps]);
  });

  it("starts a new shot at every chapter, snapped to a pause within 3 s", () => {
    const frames = plan({
      seconds: 40,
      imageSeconds: 10,
      cutPoints: [9.5, 16.1, 19.5, 29.5],
      chapterStarts: [0, 17, 35.2],
    });
    // The chapter at 17 moves to the pause at 16.1; the one at 35.2 has no pause within 3 s
    // and stays. Before the first, 9.5 is the pause nearest 10; after it, 29.5 is the only
    // pause between the floor and 4 s before the next chapter.
    expect(starts(frames)).toEqual([0, 9.5, 16.1, 29.5, 35.2]);
  });

  it("keeps a chapter that comes sooner than the floor after the one before", () => {
    const frames = plan({ seconds: 30, imageSeconds: 10, cutPoints: [], chapterStarts: [12, 13] });
    expect(starts(frames)).toEqual([0, 12, 13, 23]);
  });

  it("lets the first shot open a chapter that starts with the narration", () => {
    // The chapter at 1 s is the first words after the lead-in: no 1 s shot of silence.
    const frames = plan({ seconds: 30, imageSeconds: 10, cutPoints: [], chapterStarts: [1, 15] });
    expect(starts(frames)).toEqual([0, 10, 15, 25]);
  });

  it("is one shot for a timeline with nothing to cut", () => {
    expect(plan({ seconds: 0.5, imageSeconds: 10, cutPoints: [] })).toEqual([15]);
  });
});

describe("chapterCuts", () => {
  it("drops chapters at the very start and end and keeps them in order", () => {
    expect(chapterCuts([0, 30, 12, 12.1, 50], [12.4], 40)).toEqual([12.4, 30]);
  });
});

describe("chapterOpeningShots", () => {
  it("names the shot on screen at each chapter for Every N seconds", () => {
    expect(
      chapterOpeningShots({
        fps,
        imageSeconds: 10,
        narration: false,
        cutPoints: [],
        chapterStarts: [0, 25, 31],
      }),
    ).toEqual([0, 2, 3]);
  });

  it("names the shot each chapter's cut opens when following the narration", () => {
    expect(
      chapterOpeningShots({
        fps,
        imageSeconds: 10,
        narration: true,
        cutPoints: [9.5, 16.1, 19.5, 29.5],
        chapterStarts: [0, 17, 35.2],
      }),
    ).toEqual([0, 2, 4]);
  });
});
