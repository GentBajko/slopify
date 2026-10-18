import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import { checkText } from "./check-text.js";
import { poster } from "./document.fake.js";
import { frames } from "./frames.js";
import { layoutText } from "./layout.js";

const barlow = {
  name: "Barlow Regular",
  bytes: new Uint8Array(
    readFileSync(fileURLToPath(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url))),
  ),
  faceIndex: 0,
};
const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };

function check(filled: Readonly<Record<string, string>>, frame = frames.a4) {
  const text = poster().text;
  return checkText({
    text,
    values: filled,
    layout: layoutText(frame, text, filled, { default: { assName: "Barlow Regular" } }),
    fonts: { default: barlow },
    formatLabel: "Poster A4",
  }).map((problem) => problem.sentence);
}

it("passes a piece whose every letter is in its font and placed as typed", () => {
  expect(check(values)).toEqual([]);
});

it("names the letters a font lacks and where", () => {
  expect(check({ ...values, Venue: "Москва 東京" })).toEqual([
    "The font Barlow Regular has no “М” “о” “с” “к” “в” “а” “東” “京” for text block 2. Choose another font for it under Text, or upload one that has them.",
  ]);
});

it("says when a font is gone, and when the text can't fit", () => {
  const text = poster().text;
  expect(
    checkText({
      text,
      values,
      layout: layoutText(frames.a4, text, values, {}),
      fonts: {},
      formatLabel: "Poster A4",
    }).map((problem) => problem.sentence),
  ).toEqual([
    "The font chosen for text block 1 is no longer on this computer. Choose another font for it under Text.",
    "The font chosen for text block 2 is no longer on this computer. Choose another font for it under Text.",
  ]);
  expect(check({ ...values, Venue: "word ".repeat(600) }, frames.wide).at(-1)).toBe(
    "The text doesn't fit on Poster A4, even at the smallest readable size. Shorten it or choose a placement with more room under Text.",
  );
});

it("catches a layout that lost or changed a word", () => {
  const text = poster().text;
  const layout = layoutText(frames.a4, text, values, {});
  const changed = {
    ...layout,
    lines: layout.lines.map((line) => ({ ...line, text: line.text.replace("€12", "€13") })),
  };
  expect(
    checkText({
      text,
      values,
      layout: changed,
      fonts: { default: barlow },
      formatLabel: "Poster A4",
    }).map((problem) => problem.sentence),
  ).toEqual([
    "Slopify couldn't place text block 2 exactly as typed on Poster A4. Shorten it under Text, then press Make again.",
  ]);
});
