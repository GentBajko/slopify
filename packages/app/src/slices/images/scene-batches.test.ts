import { describe, expect, it } from "vitest";
import { sceneArticleSlices, sceneBatches, sceneMessages, scenesPerCall } from "./scenes.js";

// One call cannot write 240 scenes without rationing them: Tieflings came back at 18 words a
// scene where twelve had come back at 42, and the pictures lost the material, light and
// colour they are drawn from. Scenes are written a batch at a time instead.

describe("sceneBatches", () => {
  it("keeps slideshow order and fills every batch but the last", () => {
    const batches = sceneBatches(Array.from({ length: 240 }, (_one, at) => at));
    expect(batches).toHaveLength(15);
    expect(batches.every((batch) => batch.length === scenesPerCall)).toBe(true);
    expect(batches.flat()).toEqual(Array.from({ length: 240 }, (_one, at) => at));
  });

  it("leaves a short run as the single call it always was", () => {
    expect(sceneBatches([1, 2, 3])).toEqual([[1, 2, 3]]);
  });

  it("puts the remainder in a last, shorter batch", () => {
    const batches = sceneBatches(Array.from({ length: 20 }, (_one, at) => at));
    expect(batches.map((batch) => batch.length)).toEqual([16, 4]);
  });
});

describe("sceneArticleSlices", () => {
  const article = Array.from({ length: 12 }, (_one, at) => `Paragraph ${String(at + 1)}.`).join(
    "\n\n",
  );

  it("gives each batch the stretch its own pictures are shown over", () => {
    const slices = sceneArticleSlices(article, [2, 2, 2]);
    expect(slices).toHaveLength(3);
    expect(slices[0]).toContain("Paragraph 1.");
    expect(slices[2]).toContain("Paragraph 12.");
    // Consecutive and complete: the slices rejoin into the article.
    expect(slices.join("\n\n")).toBe(article);
  });

  it("shares the article out in proportion to each batch's pictures", () => {
    const slices = sceneArticleSlices(article, [16, 4]);
    expect((slices[0] ?? "").split("\n\n")).toHaveLength(10);
    expect((slices[1] ?? "").split("\n\n")).toHaveLength(2);
  });

  it("gives every batch the whole of an article too short to split", () => {
    expect(sceneArticleSlices("Only one.", [1, 1, 1])).toEqual([
      "Only one.",
      "Only one.",
      "Only one.",
    ]);
  });

  it("never hands a batch an empty stretch", () => {
    const slices = sceneArticleSlices(
      article,
      Array.from({ length: 11 }, () => 1),
    );
    expect(slices.every((slice) => slice.trim() !== "")).toBe(true);
  });
});

describe("a batch's request", () => {
  it("asks for its own count, so the answer is checked against the batch", () => {
    const messages = sceneMessages({
      title: "Tieflings",
      article: "A paragraph.",
      pictures: ["a wide view", "a close figure"],
    });
    expect(messages.some((one) => one.content.includes("Pictures: 2"))).toBe(true);
    expect(messages.some((one) => one.content.includes("exactly 2 strings"))).toBe(true);
  });
});
