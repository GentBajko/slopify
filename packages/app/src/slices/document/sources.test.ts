import { describe, expect, it } from "vitest";
import { markdownBlocks } from "./blocks.js";
import { documentText, tidySource } from "./sources.js";

describe("markdownBlocks", () => {
  it("keeps headings, emphasis, links, lists and quotes as the article wrote them", () => {
    expect(
      markdownBlocks(
        [
          "# Title",
          "Some **bold** and *slanted* text with [a link](https://example.com) and R\\&D.",
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
          { text: " and R&D.", strong: false, emphasis: false, href: null },
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
        "- Hammurabi: TAR-ask",
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
      {
        text: "A magazine, example.com",
        href: "https://example.com/mag",
        links: [{ label: "example.com", href: "https://example.com/mag" }],
      },
      { text: "the wiki", href: "https://example.com/wiki" },
    ]);
  });

  it("has no sources when the article lists none and there are no notes", () => {
    expect(documentText("Just a body.", null).sources).toEqual([]);
  });
});

it("reads one source per line when the model left no blank lines between them", () => {
  const article = `# T\n\nBody.\n\n## Sources Consulted\n\nWikipedia, "Kish" — https://en.wikipedia.org/wiki/Kish\nOxford, *Ancient Egypt* (1977)\n- [Antiquity #26](https://example.com/26)\n  continued on the next line\n`;
  expect(documentText(article, null).sources).toEqual([
    {
      text: 'Wikipedia, "Kish" — en.wikipedia.org',
      href: "https://en.wikipedia.org/wiki/Kish",
      links: [{ label: "en.wikipedia.org", href: "https://en.wikipedia.org/wiki/Kish" }],
    },
    { text: "Oxford, Ancient Egypt (1977)", href: null },
    { text: "Antiquity #26 continued on the next line", href: "https://example.com/26" },
  ]);
});

describe("tidySource", () => {
  it("gives a bare address a title from its path and the site's name, linking to it", () => {
    const address =
      "https://www.example.com/posts/1700-how-the-old-lighthouse-was-built?comment=51";
    expect(tidySource({ text: address, href: address })).toMatchObject({
      text: "How the old lighthouse was built — example.com",
      href: address,
    });
    // A path of ids and kinds of page says nothing: the site's name alone.
    const card = "https://cards.example.org/card/abc/91";
    expect(tidySource({ text: card, href: card }).text).toBe("cards.example.org");
  });

  it("puts the site's name in place of an entry's long address, keeping the link", () => {
    expect(
      tidySource({
        text: "A. Writer, *A Book* (1976) — first edition — https://en.wikipedia.org/wiki/A_Book.",
        href: null,
      }),
    ).toMatchObject({
      text: "A. Writer, *A Book* (1976) — first edition — en.wikipedia.org.",
      href: "https://en.wikipedia.org/wiki/A_Book",
    });
  });

  it("numbers a site cited more than once in an entry, each linking to its own page", () => {
    const item = tidySource({
      text: "Fan wiki — https://wiki.example.com/a ; https://wiki.example.com/b",
      href: null,
    });
    expect(item.text).toBe("Fan wiki — wiki.example.com ; wiki.example.com (2)");
    expect(item.links).toEqual([
      { label: "wiki.example.com", href: "https://wiki.example.com/a" },
      { label: "wiki.example.com (2)", href: "https://wiki.example.com/b" },
    ]);
  });
});
