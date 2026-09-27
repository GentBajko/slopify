import { describe, expect, it } from "vitest";
import { diffCounts, sideOf, wordDiff } from "./diff.js";

describe("wordDiff", () => {
  it("marks only the words that changed", () => {
    expect(wordDiff("Write a short essay about cats.", "Write a long essay about dogs.")).toEqual([
      { op: "same", text: "Write a " },
      { op: "removed", text: "short" },
      { op: "added", text: "long" },
      { op: "same", text: " essay about " },
      { op: "removed", text: "cats." },
      { op: "added", text: "dogs." },
    ]);
  });

  it("rebuilds both texts exactly from their sides", () => {
    const before = "Line one.\n\nLine two has {{topic}} in it.\nThe end.";
    const after = "Line one, changed.\n\nLine two has {{topic}} and {{tone}} in it.\n";
    const parts = wordDiff(before, after);
    const text = (side: "before" | "after") =>
      sideOf(parts, side)
        .map((part) => part.text)
        .join("");
    expect(text("before")).toBe(before);
    expect(text("after")).toBe(after);
  });

  it("says nothing changed for equal texts, and counts words for the summary", () => {
    expect(wordDiff("same text", "same text")).toEqual([{ op: "same", text: "same text" }]);
    expect(wordDiff("", "")).toEqual([]);
    expect(diffCounts(wordDiff("a b c", "a x y c"))).toEqual({ added: 2, removed: 1 });
  });

  it("handles one side empty", () => {
    expect(wordDiff("", "new text")).toEqual([{ op: "added", text: "new text" }]);
    expect(wordDiff("old text", "")).toEqual([{ op: "removed", text: "old text" }]);
  });

  it("stays exact on long, very different texts", () => {
    const before = Array.from({ length: 3000 }, (_, at) => `a${String(at)}`).join(" ");
    const after = Array.from({ length: 3000 }, (_, at) => `b${String(at)}`).join(" ");
    const parts = wordDiff(before, after);
    expect(
      sideOf(parts, "before")
        .map((part) => part.text)
        .join(""),
    ).toBe(before);
    expect(
      sideOf(parts, "after")
        .map((part) => part.text)
        .join(""),
    ).toBe(after);
  });
});
