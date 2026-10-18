import { describe, expect, it } from "vitest";
import {
  interestOf,
  noveltyOf,
  orderQueue,
  readingOf,
  reasonsOf,
  scoreOf,
  topicKey,
  topicScore,
} from "./score.js";

const known = { topics: ["The Red Pyramid"], projects: ["History: Cleopatra's Palace"] };

describe("noveltyOf", () => {
  it.each([
    ["Hypatia of Alexandria", 1, undefined],
    ["Cleopatra", 0, "History: Cleopatra's Palace"],
    ["The Bent Pyramid", 1 - 1 / 3, "The Red Pyramid"],
  ])("reads %s against the library", (topic, value, nearest) => {
    const novelty = noveltyOf(topic, known);
    expect(novelty.value).toBeCloseTo(value);
    expect(novelty.nearest?.title).toBe(nearest);
  });
});

describe("interestOf", () => {
  it.each([
    [null, null],
    [{ suggestHits: 0, examples: [], wikiViews: null }, 0],
    [{ suggestHits: 10, examples: [], wikiViews: 9_999_999 }, 1],
    [{ suggestHits: 5, examples: [], wikiViews: 999 }, 0.6 * (3 / 7) + 0.2],
    [{ suggestHits: null, examples: [], wikiViews: 99_999_999 }, 0.6],
  ])("weighs Wikipedia views and suggestions: %j", (reading, expected) => {
    const value = interestOf(reading);
    if (expected === null) expect(value).toBeNull();
    else expect(value).toBeCloseTo(expected, 5);
  });
});

describe("scoreOf", () => {
  it.each([
    [null, 0.5, 50],
    [1, 0, 60],
    [0.5, 1, 70],
    [0, 0, 0],
  ])("scores interest %s and novelty %s as %s", (interest, novelty, score) => {
    expect(scoreOf(interest, novelty)).toBe(score);
  });
});

describe("reasonsOf", () => {
  it("says what search and the library found", () => {
    expect(
      reasonsOf(
        noveltyOf("The Bent Pyramid", known),
        { suggestHits: 8, examples: ["bent pyramid inside"], wikiViews: 777_000 },
        "read",
      ),
    ).toEqual([
      "Search: 8 of 10 suggestions match, e.g. “bent pyramid inside”",
      "Wikipedia: 777k views last month",
      "Library: new; nearest “The Red Pyramid” (33% overlap)",
    ]);
  });

  it("says when search couldn't be reached, and when the library already covers it", () => {
    expect(reasonsOf(noveltyOf("Cleopatra", known), null, "unreachable")).toEqual([
      "Search interest unknown: no connection to Google, DuckDuckGo or Wikipedia",
      "Library: already covered by “History: Cleopatra's Palace”",
    ]);
    expect(reasonsOf(noveltyOf("Hypatia", known), null, "off")).toEqual([
      "Library: new; nothing like it made or queued",
    ]);
    expect(
      reasonsOf(
        noveltyOf("Hypatia", known),
        { suggestHits: null, examples: [], wikiViews: 2_400_000 },
        "read",
      ),
    ).toEqual(["Wikipedia: 2.4M views last month", "Library: new; nothing like it made or queued"]);
  });

  it("scores by novelty alone when search is off or unreachable", () => {
    expect(topicScore(noveltyOf("Hypatia", known), null, "unreachable")).toMatchObject({
      score: 100,
      interest: null,
    });
  });
});

describe("orderQueue", () => {
  const item = (title: string) => ({ title, values: {} });
  it("keeps added and moved topics first in their order, then the scored ones best first", () => {
    const scores = new Map([
      [topicKey("B"), { score: 40, pinned: false }],
      [topicKey("C"), { score: 90, pinned: false }],
      [topicKey("D"), { score: 10, pinned: true }],
      [topicKey("E"), { score: 90, pinned: false }],
    ]);
    expect(
      orderQueue([item("B"), item("A"), item("C"), item("D"), item("E")], scores).map(
        (one) => one.title,
      ),
    ).toEqual(["A", "D", "C", "E", "B"]);
  });

  it("leaves a queue with no scores exactly as it was", () => {
    const items = [item("Z"), item("Y")];
    expect(orderQueue(items, new Map())).toEqual(items);
  });
});

describe("readingOf", () => {
  it("counts the suggestions that hold every word of the topic, with two examples", () => {
    expect(
      readingOf("Bent Pyramid", {
        ok: true,
        suggestions: [
          "bent pyramid",
          "bent pyramid inside",
          "the bent pyramids of dahshur",
          "bent spoon",
        ],
        wikiViews: 12,
      }),
    ).toEqual({
      suggestHits: 3,
      examples: ["bent pyramid inside", "the bent pyramids of dahshur"],
      wikiViews: 12,
    });
    expect(readingOf("X", { ok: true, suggestions: null, wikiViews: null })).toEqual({
      suggestHits: null,
      examples: [],
      wikiViews: null,
    });
  });
});
