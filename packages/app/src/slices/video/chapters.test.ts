import { describe, expect, it } from "vitest";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { headingChapters, topHeadings } from "./chapters.js";

// The narration as the plain text reads it, one word a second from `from`.
function spoken(text: string, from = 2): TimedWord[] {
  return text
    .split(/\s+/)
    .filter((word) => word !== "")
    .map((word, index) => ({ text: word, start: from + index, end: from + index + 0.8 }));
}

const article = [
  "# The Old Kingdom",
  "",
  "An opening paragraph of ten words that sets the scene.",
  "",
  "## The Rise",
  "",
  "Five words about the rise.",
  "",
  "## The Fall",
  "",
  "Six words about the long fall.",
  "",
  "## Sources Consulted",
  "",
  "- A book.",
].join("\n");

describe("topHeadings", () => {
  it("skips a lone title and takes the level below", () => {
    expect(topHeadings(article).map((heading) => heading.title)).toEqual([
      "The Rise",
      "The Fall",
      "Sources Consulted",
    ]);
  });

  it("takes the top level when there are several of it, and ignores fenced code", () => {
    const text = "## One\n\ntext\n\n```\n## not a heading\n```\n\n## Two\n\n### Three";
    expect(topHeadings(text).map((heading) => heading.title)).toEqual(["One", "Two"]);
  });

  it("strips emphasis and links from a title", () => {
    expect(topHeadings("## The *Last* [King](https://x.test)")[0]?.title).toBe("The Last King");
  });
});

describe("headingChapters", () => {
  it("finds each heading where the narration says it", () => {
    const words = spoken(
      "The Old Kingdom An opening paragraph of ten words that sets the scene. The Rise Five words about the rise. The Fall Six words about the long fall.",
    );
    expect(headingChapters(article, words)).toEqual([
      { title: "The Rise", start: 2 + 13 },
      { title: "The Fall", start: 2 + 20 },
    ]);
  });

  it("falls back to the heading's share of the article when the words differ", () => {
    // A rewritten narration of the same length that never says the headings.
    const words = spoken(Array.from({ length: 30 }, () => "said").join(" "), 0);
    const chapters = headingChapters(article, words);
    expect(chapters.map((chapter) => chapter.title)).toEqual(["The Rise", "The Fall"]);
    expect(chapters[0]?.start).toBeLessThan(chapters[1]?.start ?? 0);
  });

  it("has nothing to say without words or headings", () => {
    expect(headingChapters(article, [])).toEqual([]);
    expect(headingChapters("Just text.", spoken("Just text."))).toEqual([]);
  });
});
