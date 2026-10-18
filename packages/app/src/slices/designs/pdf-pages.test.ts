import { expect, it } from "vitest";
import { readDocumentAssets } from "../document/fonts.js";
import { solidPng } from "./designs.fake.js";
import { brochurePdf, posterPdf } from "./pdf-pages.js";

const text = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
const mediaBox = (bytes: Uint8Array) =>
  (/\/MediaBox \[0 0 ([\d.]+) ([\d.]+)\]/.exec(text(bytes)) ?? [])
    .slice(1)
    .map((n) => Math.round(Number(n) * 100) / 100);
const pages = (bytes: Uint8Array) => text(bytes).match(/\/Type \/Page\b(?!s)/g)?.length ?? 0;

it("fills one page of the poster's size with the drawn piece", () => {
  const pdf = posterPdf({ kind: "poster", png: solidPng(62, 88), widthMm: 210, heightMm: 297 });
  expect(text(pdf).startsWith("%PDF-")).toBe(true);
  expect(pages(pdf)).toBe(1);
  expect(mediaBox(pdf)).toEqual([595.28, 841.89]);
  expect(text(pdf)).toContain("/Subtype /Image");
  const a5 = posterPdf({ kind: "poster", png: solidPng(44, 62), widthMm: 148, heightMm: 210 });
  expect(mediaBox(a5)).toEqual([419.53, 595.28]);
});

it("draws a brochure as a themed document with the designed cover on its title page", () => {
  const brochure = brochurePdf(
    {
      kind: "brochure",
      cover: solidPng(62, 88),
      title: "Late Set programme",
      markdown: "# Tonight\n\nDoors at eight.\n\n## The band\n\nFour players and a piano.",
      settings: { theme: "plain" },
      writtenOn: "2026-10-18T10:00:00.000Z",
    },
    readDocumentAssets(),
  );
  expect(brochure.cover).toBe("placed");
  expect(brochure.pages).toBeGreaterThanOrEqual(2);
  expect(pages(brochure.bytes)).toBe(brochure.pages);
});
