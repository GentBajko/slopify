import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fontAdvances } from "../fonts/sfnt.js";
import { poster } from "./document.fake.js";
import { frames } from "./frames.js";
import { type LayoutFont, layoutText, measuredWidth, wrapText, wrapUnits } from "./layout.js";
import { designFormats, layoutPresets } from "./model.js";
import type { DesignText } from "./schema.js";

const barlow = fontAdvances(
  readFileSync(new URL("../../assets/fonts/Barlow-Regular.ttf", import.meta.url)),
  0,
);
const measuredFont: LayoutFont = { assName: "Barlow", advance: barlow };

// The wrap as it was before it was made fast: every result must stay exactly this.
function referenceWrap(
  text: string,
  size: number,
  room: number,
  font?: LayoutFont,
  split = false,
): string[] {
  const lines: string[] = [];
  let line = "";
  const fits = (candidate: string) => measuredWidth(candidate, size, font) <= room;
  const pieces = wrapUnits(text).flatMap((unit) =>
    split && !fits(unit) ? unit.split(" ") : [unit],
  );
  for (const word of pieces) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line !== "") lines.push(line);
    line = "";
    let rest = word;
    if ([...rest].length <= 8 || rest.includes(" ")) {
      line = rest;
      continue;
    }
    while (!fits(rest)) {
      let cut = Math.max(1, [...rest].length - 1);
      while (cut > 1 && !fits([...rest].slice(0, cut).join(""))) cut -= 1;
      lines.push([...rest].slice(0, cut).join(""));
      rest = [...rest].slice(cut).join("");
    }
    line = rest;
  }
  if (line !== "") lines.push(line);
  return lines;
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 €$£.,:-·'&!?/ äöüßéñçøåł東京音楽祭";
function phrase(next: () => number, most: number, spaces = true): string {
  const length = 1 + Math.floor(next() * most);
  return Array.from({ length }, () => {
    const ch = alphabet[Math.floor(next() * alphabet.length)] ?? "a";
    return !spaces && ch === " " ? "x" : ch;
  }).join("");
}

const textOf = (blocks: readonly string[]): DesignText => ({
  preset: "centered",
  scrim: "none",
  blocks: blocks.map((text, index) => ({
    id: `b${String(index)}`,
    role: (["headline", "subhead", "details", "small"] as const)[index % 4] ?? "details",
    text,
    fontId: "default",
    color: "#FFFFFF",
  })),
});

describe("wrapText speed", () => {
  it("wraps 10,000 characters with no space in well under 200 ms", () => {
    const url = `https://example.com/${"a1B2c3".repeat(1700)}`.slice(0, 10_000);
    for (const font of [undefined, measuredFont]) {
      const started = performance.now();
      const lines = wrapText(url, 26, 950, font);
      expect(performance.now() - started).toBeLessThan(200);
      expect(lines.join("")).toBe(url);
      for (const line of lines) expect(measuredWidth(line, 26, font)).toBeLessThanOrEqual(950);
    }
  });

  it("lays out a 10,000-character block on every format in under 200 ms each", () => {
    const hashtags = Array.from({ length: 800 }, (_, i) => `#tag${String(i)}`).join("");
    const text = textOf([hashtags.slice(0, 10_000)]);
    for (const format of designFormats) {
      const started = performance.now();
      const layout = layoutText(frames[format], text, {}, { default: measuredFont });
      expect(performance.now() - started).toBeLessThan(200);
      expect(layout.overflow).toBe(true);
    }
  });

  it("lays out no more than 10,000 characters of one block and says the rest doesn't fit", () => {
    const long = "word ".repeat(40_000);
    const started = performance.now();
    const layout = layoutText(frames.story, textOf([long]), {}, { default: measuredFont });
    expect(performance.now() - started).toBeLessThan(400);
    expect(layout.overflow).toBe(true);
    expect(layout.lines.map((line) => line.text).join(" ").length).toBeLessThanOrEqual(10_000);
  });

  it("wraps CJK text, which has no spaces, inside the line and loses no character", () => {
    const cjk = "東京音楽祭の夜は長く静かに続いていく。".repeat(300);
    const started = performance.now();
    const lines = wrapText(cjk, 40, 900, measuredFont);
    expect(performance.now() - started).toBeLessThan(200);
    expect(lines.join("")).toBe(cjk);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines)
      expect(measuredWidth(line, 40, measuredFont)).toBeLessThanOrEqual(900);
    const short = layoutText(
      frames.square,
      textOf(["東京音楽祭の夜"]),
      {},
      { default: measuredFont },
    );
    expect(short.lines.map((line) => line.text)).toEqual(["東京音楽祭の夜"]);
    expect(short.overflow).toBe(false);
  });
});

describe("wrapText output", () => {
  it("wraps exactly as before for random words, long words and both measures", () => {
    const next = random(7);
    for (let round = 0; round < 1500; round++) {
      const words = Array.from({ length: 1 + Math.floor(next() * 6) }, () =>
        phrase(next, next() < 0.3 ? 120 : 14, next() < 0.5),
      );
      const text = words.join(" ");
      const size = 10 + Math.floor(next() * 120);
      const room = 60 + Math.floor(next() * 1500);
      const font = next() < 0.5 ? undefined : measuredFont;
      const split = next() < 0.2;
      expect(wrapText(text, size, room, font, split)).toEqual(
        referenceWrap(text, size, room, font, split),
      );
    }
  });

  it("lays out ordinary pieces byte for byte as before", () => {
    const next = random(11);
    const hash = createHash("sha256");
    for (let round = 0; round < 60; round++) {
      const blocks = Array.from({ length: 1 + Math.floor(next() * 3) }, () =>
        phrase(next, next() < 0.3 ? 150 : 60, next() < 0.7),
      );
      for (const preset of layoutPresets)
        for (const format of ["a4", "square", "story", "wide"] as const) {
          const text = { ...textOf(blocks), preset, scrim: "soft" } as DesignText;
          const font = next() < 0.5 ? { assName: "Barlow" } : measuredFont;
          hash.update(layoutText(frames[format], text, {}, { default: font }).ass);
        }
    }
    hash.update(layoutText(frames.a4, poster().text, { Event: "Late Set" }, {}).ass);
    expect(hash.digest("hex")).toBe(
      "0122e22e4a2338016227f2722db6fadb30e2fe088e5aafa582ace03a7b987737",
    );
  });
});
