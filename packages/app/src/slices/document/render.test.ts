import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { readDocumentAssets } from "./fonts.js";
import { type DocumentInput, renderDocument } from "./render.js";
import { builtInTheme } from "./theme.js";

const article = `# The Tarrasque

The Tarrasque is a legendary creature whose **appetite** is matched only by its *resilience*, and whose story runs through [decades of lore](https://example.com/lore).

## Origins

Few creatures have been written about as often, and fewer still survive every edition of the rules that describe them in such detail.

- First appearance in 1982
- Returned in every edition

> A walking catastrophe.

## Chapter 2: Legacy – Beyond the Tables

It became shorthand for any threat that cannot be stopped, and the phrase travelled well beyond the game itself into wider culture.

### A note on names

Short.

## Sources Consulted

- [Monster Manual](https://example.com/mm)
- Dragon Magazine, issue 90
`;

const assets = readDocumentAssets();

function input(over: Partial<DocumentInput> = {}): DocumentInput {
  return {
    title: "The Tarrasque",
    articleMarkdown: article,
    researchNotes: null,
    cover: null,
    theme: builtInTheme("dicemaster"),
    writtenOn: new Date("2026-09-25T12:00:00Z"),
    assets,
    ...over,
  };
}

// The generator compresses page content, but link annotations and the page tree are plain
// objects, so what a reader can click and how many pages it has can be read off the file.
function pdf(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("latin1");
}

function png(width: number, height: number): Uint8Array {
  const crc = (data: Buffer): number => {
    let value = ~0;
    for (const byte of data) {
      value ^= byte;
      for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ (0xedb88320 & -(value & 1));
    }
    return ~value >>> 0;
  };
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([length, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 2, 0, 0, 0], 8);
  const rows = Buffer.alloc((width * 3 + 1) * height, 0x80);
  for (let row = 0; row < height; row += 1) rows[row * (width * 3 + 1)] = 0;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", header),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

describe("renderDocument", () => {
  it("lays out the article's headings as the contents and keeps its links clickable", () => {
    const result = renderDocument(input());
    const file = pdf(result.bytes);

    expect(file.startsWith("%PDF-")).toBe(true);
    expect(result.pages).toBeGreaterThan(3);
    expect(file.match(/\/Type \/Page\b/g)?.length).toBe(result.pages);
    // The repeated title is left to the title page; level 3 is below the contents' depth.
    expect(result.contents.map((entry) => entry.title)).toEqual([
      "Origins",
      "Chapter 2: Legacy – Beyond the Tables",
      "Sources Consulted",
      "About DiceMaster.io",
    ]);
    // The pages after the article line up with its outermost headings.
    expect(new Set(result.contents.map((entry) => entry.level))).toEqual(new Set([2]));
    // Title page, one contents page, then the body.
    expect(result.contents[0]?.page).toBe(3);
    for (const entry of result.contents) expect(entry.page).toBeLessThanOrEqual(result.pages);
    expect(file).toContain("/URI (https://example.com/lore)");
    expect(file).toContain("/URI (https://dicemaster.io/)");
    // The contents entries jump to their pages.
    expect(file.match(/\/Dest \[/g)?.length).toBe(result.contents.length);
  });

  it("turns the article's sources section into the Sources page instead of body text", () => {
    const result = renderDocument(
      input({
        researchNotes:
          "See [the SRD](https://example.com/srd), https://example.com/mm again, and https://example.com/wiki.",
      }),
    );
    const file = pdf(result.bytes);

    // Two listed in the article, then the two new links the notes cite.
    expect(result.sources).toBe(4);
    expect(file).toContain("/URI (https://example.com/mm)");
    expect(file).toContain("/URI (https://example.com/srd)");
    expect(file).toContain("/URI (https://example.com/wiki)");
    expect(result.words).toBeLessThan(article.split(/\s+/).length);
  });

  it("places the thumbnail on the title page when there is one", () => {
    const without = renderDocument(input());
    const cover = renderDocument(input({ cover: png(32, 18) }));

    expect(without.cover).toBe("none");
    expect(cover.cover).toBe("placed");
    expect(pdf(cover.bytes).match(/\/Subtype \/Image/g)?.length).toBe(
      (pdf(without.bytes).match(/\/Subtype \/Image/g)?.length ?? 0) + 1,
    );
  });

  it("leaves off a cover it can't read rather than failing the document", () => {
    const result = renderDocument(input({ cover: new Uint8Array([0x47, 0x49, 0x46, 0x38]) }));

    expect(result.cover).toBe("unsupported");
    expect(result.pages).toBeGreaterThan(0);
  });

  it("draws the plain theme without the brand, texture or closing page", () => {
    const branded = renderDocument(input());
    const plain = renderDocument(input({ theme: builtInTheme("plain") }));
    const file = pdf(plain.bytes);

    expect(file).not.toContain("dicemaster.io");
    expect(file).not.toMatch(/\/Subtype \/Image/);
    expect(plain.contents.map((entry) => entry.title)).not.toContain("About DiceMaster.io");
    expect(plain.pages).toBe(branded.pages - 1);
  });

  it("refuses an article with nothing to print", () => {
    expect(() =>
      renderDocument(input({ articleMarkdown: "# The Tarrasque\n\n## Sources Consulted\n\n- x" })),
    ).toThrow(/Edit project → Article.*Retry stage on Document/);
  });

  it("gives a long article as many contents pages as its headings need", () => {
    const long = Array.from(
      { length: 45 },
      (_, index) => `## Section ${index + 1}\n\n${"A sentence that fills the page. ".repeat(12)}`,
    ).join("\n\n");
    const result = renderDocument(input({ articleMarkdown: long, theme: builtInTheme("plain") }));

    expect(result.contents).toHaveLength(45);
    // 45 entries need two contents pages, so the body starts on page 4.
    expect(result.contents[0]?.page).toBe(4);
    expect(pdf(result.bytes).match(/\/Dest \[/g)?.length).toBe(45);
  });
});
