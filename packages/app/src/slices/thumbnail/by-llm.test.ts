import { describe, expect, it } from "vitest";
import type { ThumbnailBrief } from "./by-llm.js";
import { thumbnailMessages, writtenPrompt } from "./by-llm.js";

// The filled thumbnail prompt as the instruction, then the video title, the keyword values, the
// run's aspect, and the full plain-text article.

function brief(over: Partial<ThumbnailBrief> = {}): ThumbnailBrief {
  return {
    instruction: "A bold thumbnail about rope.",
    title: "Rope Tricks",
    values: { topic: "rope", tone: "warm" },
    format: "16:9",
    article: "Rope is twisted fibre.",
    ...over,
  };
}

function only(given: ThumbnailBrief): string {
  const messages = thumbnailMessages(given);
  expect(messages).toHaveLength(1);
  expect(messages[0]?.role).toBe("user");
  return messages[0]?.content ?? "";
}

describe("thumbnailMessages", () => {
  it("puts the five parts in the order the scenario names them", () => {
    expect(only(brief())).toBe(
      [
        "A bold thumbnail about rope.",
        "",
        "Video title: Rope Tricks",
        "",
        "Keyword values for this run:",
        "",
        "topic: rope",
        "tone: warm",
        "",
        "Aspect ratio of the thumbnail: 16:9",
        "",
        "The article this video narrates:",
        "",
        "Rope is twisted fibre.",
      ].join("\n"),
    );
  });

  it("says so rather than leaving a gap when the run has no keywords", () => {
    expect(only(brief({ values: {} }))).toContain("Keyword values for this run:\n\n(none)\n");
  });

  it("names the run's own aspect", () => {
    expect(only(brief({ format: "9:16" }))).toContain("Aspect ratio of the thumbnail: 9:16");
  });
});

describe("writtenPrompt", () => {
  // Empty output is a failed attempt.
  it("calls an empty answer unusable, whitespace included", () => {
    expect(writtenPrompt("")).toBe("the LLM wrote no thumbnail prompt");
    expect(writtenPrompt("   \n\t ")).toBe("the LLM wrote no thumbnail prompt");
  });

  it("accepts anything the model actually wrote", () => {
    expect(writtenPrompt("A weathered dock.")).toBeUndefined();
  });
});
