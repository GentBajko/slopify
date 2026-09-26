import { describe, expect, it } from "vitest";
import { markdownBlocks } from "./blocks.js";
import { documentText } from "./sources.js";

describe("markdownBlocks", () => {
  it("keeps headings, emphasis, links, lists and quotes as the article wrote them", () => {
    expect(
      markdownBlocks(
        [
          "# Title",
          "Some **bold** and *slanted* text with [a link](https://example.com) and D\\&D.",
          "#### Deep heading",
          "1. First\n2. Second\n   - Nested",
          "> Quoted line",
          "---",
        ].join("\n\n"),
      ),
    ).toEqual([
      { kind: "heading", level: 1, text: "Title" },
      {
        kind: "paragraph",
        runs: [
          { text: "Some ", strong: false, emphasis: false, href: null },
          { text: "bold", strong: true, emphasis: false, href: null },
          { text: " and ", strong: false, emphasis: false, href: null },
          { text: "slanted", strong: false, emphasis: true, href: null },
          { text: " text with ", strong: false, emphasis: false, href: null },
          { text: "a link", strong: false, emphasis: false, href: "https://example.com" },
          { text: " and D&D.", strong: false, emphasis: false, href: null },
        ],
      },
      { kind: "heading", level: 3, text: "Deep heading" },
      {
        kind: "item",
        depth: 0,
        marker: "1.",
        runs: [{ text: "First", strong: false, emphasis: false, href: null }],
      },
      {
        kind: "item",
        depth: 0,
        marker: "2.",
        runs: [{ text: "Second", strong: false, emphasis: false, href: null }],
      },
      {
        kind: "item",
        depth: 1,
        marker: "•",
        runs: [{ text: "Nested", strong: false, emphasis: false, href: null }],
      },
      {
        kind: "quote",
        runs: [{ text: "Quoted line", strong: false, emphasis: false, href: null }],
      },
      { kind: "rule" },
    ]);
  });
});

describe("documentText", () => {
  it("moves the sources section to the Sources page and leaves the glossary out", () => {
    const text = documentText(
      [
        "Body paragraph.",
        "**Sources Consulted:**",
        "- [Book](https://example.com/book)\n- A magazine, https://example.com/mag",
        "## Pronunciation Glossary",
        "- Tarrasque: TAR-ask",
      ].join("\n\n"),
      "Notes cite [the wiki](https://example.com/wiki) and https://example.com/book again.",
    );

    expect(text.blocks).toEqual([
      {
        kind: "paragraph",
        runs: [{ text: "Body paragraph.", strong: false, emphasis: false, href: null }],
      },
    ]);
    expect(text.sources).toEqual([
      { text: "Book", href: "https://example.com/book" },
      { text: "A magazine, https://example.com/mag", href: "https://example.com/mag" },
      { text: "the wiki", href: "https://example.com/wiki" },
    ]);
  });

  it("has no sources when the article lists none and there are no notes", () => {
    expect(documentText("Just a body.", null).sources).toEqual([]);
  });
});

it("reads one source per line when the model left no blank lines between them", () => {
  const article = `# T\n\nBody.\n\n## Sources Consulted\n\nWikipedia, "Lich" — https://en.wikipedia.org/wiki/Lich\nTSR, *Monster Manual* (1977)\n- [Dragon #26](https://example.com/26)\n  continued on the next line\n`;
  expect(documentText(article, null).sources).toEqual([
    {
      text: 'Wikipedia, "Lich" — https://en.wikipedia.org/wiki/Lich',
      href: "https://en.wikipedia.org/wiki/Lich",
    },
    { text: "TSR, Monster Manual (1977)", href: null },
    { text: "Dragon #26 continued on the next line", href: "https://example.com/26" },
  ]);
});
