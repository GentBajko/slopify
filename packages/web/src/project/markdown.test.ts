import { describe, expect, it } from "vitest";
import { blocksOf, spansOf, splitTitle } from "./markdown.js";

describe("reading an article back as prose", () => {
  it("cuts blocks at blank lines", () => {
    const blocks = blocksOf("First one.\n\nSecond one.");
    expect(blocks.map((block) => block.kind)).toEqual(["paragraph", "paragraph"]);
    expect(blocks[1]?.spans[0]?.text).toBe("Second one.");
  });

  it("treats a run of blank lines as one break and drops the empties", () => {
    expect(blocksOf("\n\n  \n\nOne.\n\n \n\n\nTwo.\n\n").length).toBe(2);
  });

  it("joins a wrapped paragraph, because the breaks are the model's wrapping", () => {
    expect(blocksOf("A line\nand its wrap.")[0]?.spans[0]?.text).toBe("A line and its wrap.");
  });

  it("reads a heading and collapses six levels onto three sizes", () => {
    expect(blocksOf("# Top")[0]).toEqual({
      kind: "heading",
      level: 1,
      spans: [{ text: "Top", bold: false }],
    });
    expect(blocksOf("###### Deep")[0]).toMatchObject({ kind: "heading", level: 3 });
  });

  it("leaves a hash with no space after it as ordinary text", () => {
    expect(blocksOf("#NotAHeading")[0]?.kind).toBe("paragraph");
  });

  it("keeps a heading line that carries a paragraph under it as one paragraph", () => {
    // Splitting mid-block would lose the blank line the writer did not put there.
    expect(blocksOf("# Top\nand more").length).toBe(1);
    expect(blocksOf("# Top\nand more")[0]?.kind).toBe("paragraph");
  });

  it("takes the article's own title off the top and keeps the rest", () => {
    const split = splitTitle("## The Archlich\n\nBody.");
    expect(split.title).toBe("The Archlich");
    expect(split.body.map((block) => block.spans[0]?.text)).toEqual(["Body."]);
  });

  it("has no title when the article opens with prose, and keeps every block", () => {
    expect(splitTitle("Just prose.")).toEqual({
      title: undefined,
      body: blocksOf("Just prose."),
    });
    expect(splitTitle("")).toEqual({ title: undefined, body: [] });
  });

  it("leaves a heading that is not the first block where it stands", () => {
    const split = splitTitle("Lead-in.\n\n## Later");
    expect(split.title).toBeUndefined();
    expect(split.body.length).toBe(2);
  });
});

describe("bold runs inside a line", () => {
  it("splits the marked run out of the text around it", () => {
    expect(spansOf("a **b** c")).toEqual([
      { text: "a ", bold: false },
      { text: "b", bold: true },
      { text: " c", bold: false },
    ]);
  });

  it("leaves an unclosed marker as the characters it is", () => {
    expect(spansOf("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
  });

  it("handles a line that is bold end to end", () => {
    expect(spansOf("**all**")).toEqual([{ text: "all", bold: true }]);
  });

  it("answers with one empty span for an empty line, so a render always has a child", () => {
    expect(spansOf("")).toEqual([{ text: "", bold: false }]);
    expect(spansOf("****")).toEqual([{ text: "", bold: false }]);
  });
});
