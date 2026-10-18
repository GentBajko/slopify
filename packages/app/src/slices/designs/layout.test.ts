import { describe, expect, it } from "vitest";
import { poster } from "./document.fake.js";
import { frames } from "./frames.js";
import { estimatedWidth, layoutText, minTextShare, safeArea, wrapText } from "./layout.js";
import { layoutPresets } from "./model.js";
import type { DesignText } from "./schema.js";

const fonts = { default: { assName: "Barlow" } };
const values = { Event: "Late Set", Date: "2026-11-14", Venue: "The Cellar", Price: "€12" };

// A small seeded generator, so a failing case can be replayed.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

const alphabet =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 €$£.,:-·'&!?{}\\ äöüßéñçøåł";
function phrase(next: () => number, most: number): string {
  const length = 1 + Math.floor(next() * most);
  return Array.from({ length }, () => alphabet[Math.floor(next() * alphabet.length)] ?? "a").join(
    "",
  );
}

function unescapeAss(ass: string): string {
  return ass.replace(/\\\\/g, "\\").replace(/\\\{/g, "{").replace(/\\\}/g, "}");
}

describe("text layout", () => {
  it("draws a gig poster the same way every time", () => {
    const layout = layoutText(frames.a4, poster().text, values, fonts);
    expect(layout.overflow).toBe(false);
    expect(layout.ass).toMatchInlineSnapshot(`
      "[Script Info]
      ScriptType: v4.00+
      PlayResX: 2480
      PlayResY: 3508
      WrapStyle: 2
      ScaledBorderAndShadow: yes

      [V4+ Styles]
      Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
      Style: Design,Barlow,99,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1

      [Events]
      Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
      Dialogue: 0,0:00:00.00,0:00:10.00,Design,,0,0,0,,{\\an7\\pos(0,0)\\p1\\bord0\\shad0\\c&H000000&\\1a&H40&}m 0 2437 l 2480 2437 l 2480 3508 l 0 3508{\\p0}
      Dialogue: 1,0:00:00.00,0:00:10.00,Design,,0,0,0,,{\\an8\\pos(1240,2511)\\fnBarlow\\fs273\\c&HFFFFFF&\\bord0\\3c&H000000&\\shad0}Late Set
      Dialogue: 1,0:00:00.00,0:00:10.00,Design,,0,0,0,,{\\an8\\pos(1240,2889)\\fnBarlow\\fs112\\c&HDDEEFF&\\bord0\\3c&H000000&\\shad0}2026-11-14 · The Cellar · €12
      "
    `);
  });

  it("places the title at the top, a band at the bottom, centred and in a left column", () => {
    for (const preset of layoutPresets) {
      const text: DesignText = { ...poster().text, preset, scrim: "soft" };
      const layout = layoutText(frames.square, text, values, fonts);
      const area = safeArea(frames.square, preset);
      expect(layout.area).toEqual(area);
      for (const line of layout.lines) {
        expect(line.y).toBeGreaterThanOrEqual(area.y);
        expect(line.y + line.size).toBeLessThanOrEqual(area.y + area.height);
      }
    }
    expect(
      layoutText(frames.square, { ...poster().text, preset: "left-column" }, values, fonts).ass,
    ).toContain("\\an7");
    expect(
      layoutText(frames.square, { ...poster().text, preset: "centered" }, values, fonts).ass,
    ).toContain("\\an8");
  });

  it("draws a band across the frame, a soft scrim behind the text, or none", () => {
    const of = (scrim: DesignText["scrim"]) =>
      layoutText(frames.wide, { ...poster().text, scrim }, values, fonts)
        .ass.split("\n")
        .filter((line) => line.includes("\\p1"));
    expect(of("none")).toEqual([]);
    expect(of("band")[0]).toMatch(/m 0 \d+ l 1920 \d+/);
    expect(of("soft")[0]).toMatch(/\\1a&H80&/);
  });

  it("leaves out a block whose text is blank once filled", () => {
    const layout = layoutText(
      frames.square,
      poster().text,
      { Event: "  ", Date: "x", Venue: "y", Price: "z" },
      fonts,
    );
    expect(layout.lines.map((line) => line.blockId)).toEqual(["b2"]);
  });

  it("breaks a word too long for the line rather than letting it leave the frame", () => {
    const lines = wrapText("Supercalifragilisticexpialidocious", 100, 600);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.join("")).toBe("Supercalifragilisticexpialidocious");
    for (const line of lines) expect(estimatedWidth(line, 100)).toBeLessThanOrEqual(600);
    expect(wrapText("W", 100, 10)).toEqual(["W"]);
  });

  it("keeps every value verbatim, inside the safe area, and never below the size floor", () => {
    const next = random(20261018);
    for (let run = 0; run < 300; run += 1) {
      const format = (["a4", "square", "story", "wide", "flyer"] as const)[run % 5] ?? "a4";
      const frame = frames[format];
      const preset = layoutPresets[Math.floor(next() * layoutPresets.length)] ?? "centered";
      const filled = {
        Event: phrase(next, 60),
        Date: phrase(next, 20),
        Venue: phrase(next, 80),
        Price: phrase(next, 12),
      };
      const layout = layoutText(frame, { ...poster().text, preset }, filled, fonts);
      const floor = Math.round(Math.min(frame.width, frame.height) * minTextShare);
      const drawn = layout.ass
        .split("\n")
        .filter((line) => line.startsWith("Dialogue: 1"))
        .map((line) => unescapeAss(line.replace(/^.*?\\shad0\}/, "")));
      const joined = (id: string) =>
        layout.lines
          .filter((line) => line.blockId === id)
          .map((line) => line.text)
          .join(" ");
      expect(drawn.join("\n")).toBe(layout.lines.map((line) => line.text).join("\n"));
      const squash = (value: string) => value.replace(/\s+/g, "");
      expect(squash(joined("b1"))).toBe(squash(filled.Event));
      expect(squash(joined("b2"))).toBe(
        squash(`${filled.Date} · ${filled.Venue} · ${filled.Price}`),
      );
      for (const line of layout.lines) {
        expect(line.size).toBeGreaterThanOrEqual(floor);
        expect(line.width).toBeLessThanOrEqual(layout.area.width + 1);
        if (!layout.overflow)
          expect(line.y + line.size).toBeLessThanOrEqual(layout.area.y + layout.area.height + 1);
      }
    }
  });

  it("says a piece is too full rather than dropping text", () => {
    const long = "word ".repeat(400);
    const layout = layoutText(
      frames.wide,
      { ...poster().text, preset: "top-title" },
      { ...values, Event: long },
      fonts,
    );
    expect(layout.overflow).toBe(true);
    expect(
      layout.lines
        .filter((line) => line.blockId === "b1")
        .map((line) => line.text)
        .join(" "),
    ).toBe(long.trim());
  });
});
