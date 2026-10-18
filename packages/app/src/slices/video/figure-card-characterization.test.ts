import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { type CardInput, cardLayout, defaultCardStyle } from "./figure-card.js";

// Pins every card's script to the bytes it had before the ASS escaping moved to ass-text.ts,
// so sharing it with designs can never change a card a video already shows.
const inputs: readonly Omit<CardInput, "style">[] = [
  {
    kind: "table",
    source: "| Seed | {Rivers} | Lakes \\ Peaks |\n|---|---:|---|\n| 1 | 12 | 3 |\n| 2 | 40 | 9 |",
    section: "Results {draft}",
    width: 1920,
    height: 1080,
    picture: false,
  },
  {
    kind: "figure",
    source: "Alt text: A {map} of the \\ coast\nCaption: The coast   in 1820",
    section: null,
    width: 1080,
    height: 1920,
    picture: true,
  },
  {
    kind: "figure",
    source: "Caption: No picture here",
    section: "S",
    width: 1920,
    height: 1080,
    picture: false,
  },
  {
    kind: "math",
    source: "$$\\frac{a}{b} = \\sqrt{x^2}$$",
    section: null,
    width: 1920,
    height: 1080,
    picture: false,
  },
  {
    kind: "code",
    source: "```ts\nconst  x = { a: 1 };\n\tif (x) {\\n}\n```",
    section: "Code",
    width: 1920,
    height: 1080,
    picture: false,
  },
];

it("draws every card's script byte for byte as before", () => {
  const digest = createHash("sha256");
  for (const input of inputs) {
    const layout = cardLayout({ ...input, style: defaultCardStyle });
    digest.update(layout.ass);
    digest.update(JSON.stringify(layout.box ?? null));
  }
  expect(digest.digest("hex")).toBe(
    "46eea5261be6e7658a167d729288412ec352b0908b6451765449f738b9ee0226",
  );
});
