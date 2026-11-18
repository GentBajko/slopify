import { describe, expect, it } from "vitest";
import type { KeptShort } from "../revisions/model.js";
import { anchorKept, keptOf, locateClip, withNewPicks } from "./keep.js";
import type { ShortPick } from "./pick.js";

const sentences = (texts: readonly string[], from = 0) =>
  texts.map((text, at) => ({ start: from + at * 10, end: from + at * 10 + 9.5, text }));
const story = ["One.", "Two.", "Three.", "Four.", "Five.", "Six.", "Seven.", "Eight."];

const pick = (number: number, first: number, last: number): ShortPick => ({
  number,
  first,
  last,
  start: 0,
  end: 1,
  title: `Short ${String(number)}`,
  description: "Line.",
  hashtags: ["#Lore"],
  why: "Stands alone.",
  text: "",
  seed: `seed-${String(number)}`,
});

describe("keeping shorts through a change of their moments", () => {
  it("remembers a short by its sentences: first, last, how many and every word", () => {
    expect(keptOf(pick(4, 3, 5), sentences(story))).toEqual({
      from: 4,
      opening: "Three.",
      closing: "Five.",
      sentences: 3,
      title: "Short 4",
      description: "Line.",
      hashtags: ["#Lore"],
      why: "Stands alone.",
      seed: "seed-4",
      text: "Three. Four. Five.",
    });
  });

  it("finds kept shorts again after a new intro moved every sentence, numbered by their place", () => {
    const kept = [keptOf(pick(4, 3, 5), sentences(story)), keptOf(pick(1, 7, 8), sentences(story))];
    // Two intro sentences now come first, and everything starts 25 s later.
    const moved = sentences(["Welcome.", "Today.", ...story], 25);
    const { picks, lost } = anchorKept(kept as KeptShort[], moved, 200);
    expect(lost).toEqual([]);
    expect(picks.map((one) => [one.number, one.first, one.last, one.title, one.seed])).toEqual([
      [1, 5, 7, "Short 4", "seed-4"],
      [2, 9, 10, "Short 1", "seed-1"],
    ]);
    expect(picks[0]?.text).toBe("Three. Four. Five.");
    expect(picks[0]?.start).toBeGreaterThan(60);
  });

  it("finds which kept short's sentences changed in the narration", () => {
    const kept = [keptOf(pick(2, 3, 5), sentences(story)) as KeptShort];
    const edited = sentences(story.map((text) => (text === "Four." ? "Four, again." : text)));
    expect(anchorKept(kept, sentences(story), 100).lost).toEqual([]);
    const reword = sentences(story.map((text) => (text === "Five." ? "Five, reworded." : text)));
    expect(anchorKept(kept, reword, 100).lost).toEqual([1]);
    // A word changed between its ends is a changed short too.
    expect(anchorKept(kept, edited, 100).lost).toEqual([1]);
    // A list saved before shorts remembered every word still finds it by its ends.
    const { text: _words, ...older } = kept[0] as KeptShort;
    expect(anchorKept([older], edited, 100).lost).toEqual([]);
  });

  it("numbers new shorts after the kept ones, in the order they play, with the pick's token", () => {
    const kept = [{ ...pick(1, 1, 2), start: 50 }];
    const fresh = [
      { ...pick(1, 7, 8), start: 90 },
      { ...pick(2, 4, 5), start: 30 },
    ];
    expect(
      withNewPicks(kept, fresh, "token").map((one) => [one.number, one.first, one.seed]),
    ).toEqual([
      [1, 1, "seed-1"],
      [2, 4, "token"],
      [3, 7, "token"],
    ]);
  });

  it("gives a short whose own words changed a new moment in its place, the others keep theirs", () => {
    const kept = [
      { ...pick(1, 1, 2), start: 10 },
      { ...pick(3, 7, 8), start: 70 },
    ];
    expect(
      withNewPicks(kept, [{ ...pick(1, 4, 5), start: 40 }], "token").map((one) => [
        one.number,
        one.first,
        one.seed,
      ]),
    ).toEqual([
      [1, 1, "seed-1"],
      [2, 4, "token"],
      [3, 7, "seed-3"],
    ]);
  });

  it("finds a clip's sentences again where words before it moved them", () => {
    const clip = { first: 3, last: 4, text: "Three. Four." };
    const now = sentences(story);
    expect(locateClip(now, clip, 100)).toMatchObject({ first: 3, last: 4 });
    const added = sentences(["Zero.", "Zero again.", ...story]);
    expect(locateClip(added, clip, 100)).toMatchObject({ first: 5, last: 6 });
    const reworded = sentences(story.map((text) => (text === "Four." ? "Four, now." : text)));
    expect(locateClip(reworded, clip, 100)).toBeUndefined();
  });
});
