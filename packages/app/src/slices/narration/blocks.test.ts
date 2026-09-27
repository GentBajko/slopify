import { describe, expect, it } from "vitest";
import { splitEndMatter } from "../article/split.js";
import { describedBlocks, narrationBlocks, spokenNarration } from "./blocks.js";

// The narration's blocks: every character a voice would read aloud as punctuation is gone
// from the text blocks, and every table, picture, equation and program is kept whole for the
// text model to describe.

const texts = (markdown: string, options = {}) =>
  narrationBlocks(markdown, options).flatMap((block) =>
    block.kind === "text" ? [block.text] : [],
  );

describe("narrationBlocks", () => {
  it("keeps headings and paragraphs as their words, links as their text", () => {
    expect(
      texts(
        "# The *Mary Rose*\n\nShe sank in **1545**; the [wreck](https://example.test/w) lay there.\n",
      ),
    ).toEqual(["The Mary Rose", "She sank in 1545; the wreck lay there."]);
  });

  it("drops footnote markers, bare URLs and footnote definitions", () => {
    expect(
      texts(
        "Raised in 1982[^1], see https://example.test/raise [2] or <https://example.test>.\n\n[^1]: Never spoken.\n",
      ),
    ).toEqual(["Raised in 1982, see or."]);
  });

  it("turns an ordered list into First, Then, Finally", () => {
    expect(texts("1. Built in 1510\n2. Sank in 1545\n3. Raised in 1982\n")).toEqual([
      "First, Built in 1510. Then, Sank in 1545. Finally, Raised in 1982.",
    ]);
  });

  it("reads short bullet points as one sentence and long ones as sentences", () => {
    expect(texts("- oak\n- elm\n- ash\n")).toEqual(["Oak, elm and ash."]);
    expect(texts("- The hull was oak from Kent\n- Her guns were cast in bronze by hand\n")).toEqual(
      ["The hull was oak from Kent. Her guns were cast in bronze by hand."],
    );
  });

  it("gives another language no English connecting words", () => {
    expect(texts("1. Gebaut 1510\n2. Gesunken 1545\n", { language: "de" })).toEqual([
      "Gebaut 1510. Gesunken 1545.",
    ]);
  });

  it("speaks a blockquote as a quote", () => {
    expect(texts("> A quote about the ship.\n")).toEqual(["“A quote about the ship.”"]);
  });

  it("keeps a table whole for a description", () => {
    const blocks = narrationBlocks("## Ports\n\n| Port | Range |\n|---|---|\n| Brest | 7 m |\n");
    expect(describedBlocks(blocks)).toEqual([
      {
        kind: "table",
        index: 1,
        source: "| Port | Range |\n|---|---|\n| Brest | 7 m |",
        section: "Ports",
      },
    ]);
  });

  it("gathers a figure's alt text, caption and legend with its picture", () => {
    const blocks = describedBlocks(
      narrationBlocks(
        "![Relief map](maps/relief.png)\n\n*Figure 3: Elevation of the valley.*\n\nLegend: blue is low ground, red is high.\n\nThe next paragraph.\n",
      ),
    );
    expect(blocks).toEqual([
      {
        kind: "figure",
        index: 1,
        source:
          "Alt text: Relief map\nCaption: Figure 3: Elevation of the valley.\nCaption: Legend: blue is low ground, red is high.",
        section: null,
        image: "maps/relief.png",
      },
    ]);
  });

  it("reads an HTML figure the same way", () => {
    const [figure] = describedBlocks(
      narrationBlocks(
        '<figure><img src="rivers.png" alt="Rivers"><figcaption>Rivers after <b>1000</b> years</figcaption></figure>\n',
      ),
    );
    expect(figure).toMatchObject({
      kind: "figure",
      image: "rivers.png",
      source: "Alt text: Rivers\nCaption: Rivers after 1000 years",
    });
  });

  it("describes Mermaid and ASCII drawings as diagrams", () => {
    const blocks = describedBlocks(
      narrationBlocks(
        "```mermaid\ngraph TD; A-->B\n```\n\n```\n+----+    +----+\n| in | -> | out|\n+----+    +----+\n```\n",
      ),
    );
    expect(blocks.map((block) => block.kind)).toEqual(["diagram", "diagram"]);
  });

  it("summarises code by default and leaves it out when asked", () => {
    const markdown = "Before.\n\n```rust\nfn carve(h: &mut [f32]) {}\n```\n\nAfter.\n";
    expect(describedBlocks(narrationBlocks(markdown))).toMatchObject([
      { kind: "code", lang: "rust", source: "```rust\nfn carve(h: &mut [f32]) {}\n```" },
    ]);
    const skipped = narrationBlocks(markdown, { code: "skip" });
    expect(describedBlocks(skipped)).toEqual([]);
    expect(spokenNarration(skipped, () => null)).toBe("Before.\n\nAfter.\n");
  });

  it("says a display equation in words, and a paragraph with a formula in it", () => {
    const blocks = describedBlocks(
      narrationBlocks(
        "Evaporation follows\n\n$$\nE = k \\frac{T_s - T_a}{h}\n$$\n\nwhere $E_0 = k_1 T$ is the rate at $T$.\n",
      ),
    );
    expect(blocks).toEqual([
      { kind: "math", index: 1, source: "$$\nE = k \\frac{T_s - T_a}{h}\n$$", section: null },
      {
        kind: "math",
        index: 2,
        source: "where $E_0 = k_1 T$ is the rate at $T$.",
        section: null,
        inline: true,
      },
    ]);
  });

  it("reads a short symbol plainly and never takes a price or code for an equation", () => {
    expect(texts("At $T$ and $\\alpha$ it costs $5 to $10, as `echo $HOME` shows.\n")).toEqual([
      "At T and alpha it costs $5 to $10, as echo $HOME shows.",
    ]);
  });

  it("numbers described blocks in reading order", () => {
    const blocks = describedBlocks(
      narrationBlocks("| a |\n|---|\n| 1 |\n\n![x](x.png)\n\n```js\nx()\n```\n"),
    );
    expect(blocks.map((block) => [block.kind, block.index])).toEqual([
      ["table", 1],
      ["figure", 2],
      ["code", 3],
    ]);
  });

  it("never reaches the pronunciation glossary or the sources", () => {
    const markdown =
      "Brest is a port.\n\n## Sources Consulted\n\n| Source | Year |\n|---|---|\n| Atlas | 1990 |\n\n## Pronunciation Glossary\nBrest: /bʁɛst/\n";
    const blocks = narrationBlocks(splitEndMatter(markdown).body);
    expect(blocks).toEqual([{ kind: "text", text: "Brest is a port." }]);
  });
});

describe("spokenNarration", () => {
  it("puts each passage where its block was, as the flattened text is shaped", () => {
    const blocks = narrationBlocks("Intro.\n\n| a |\n|---|\n| 1 |\n\nOutro.\n");
    expect(spokenNarration(blocks, () => "One row, one value.")).toBe(
      "Intro.\n\nOne row, one value.\n\nOutro.\n",
    );
  });

  it("is unknown while any passage is", () => {
    expect(spokenNarration(narrationBlocks("| a |\n|---|\n| 1 |\n"), () => null)).toBeNull();
  });
});
