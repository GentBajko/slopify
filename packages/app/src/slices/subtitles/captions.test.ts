import { describe, expect, it } from "vitest";
import { captionCues, serializeAss, serializeSrt, serializeVtt } from "./captions.js";

describe("timed caption files", () => {
  it("uses real word boundaries, breaking at long pauses and keeping punctuation", () => {
    const cues = captionCues([
      { text: "Hello,", start: 1.12, end: 1.48 },
      { text: "world!", start: 1.52, end: 2.1 },
      { text: "Again.", start: 5, end: 5.5 },
    ]);
    expect(cues).toEqual([
      { start: 1.12, end: 2.1, text: "Hello, world!" },
      { start: 5, end: 5.5, text: "Again." },
    ]);
    expect(serializeSrt(cues)).toContain("00:00:01,120 --> 00:00:02,100\nHello, world!");
    expect(serializeVtt(cues)).toMatch(/^WEBVTT\n\n/);
  });
  it("escapes markup and ASS overrides so article text stays literal", () => {
    const cues = [{ start: 0, end: 1, text: "<b> & {\\pos(0,0)}" }];
    expect(serializeVtt(cues)).toContain("&lt;b&gt; &amp;");
    const ass = serializeAss(cues, {
      width: 1920,
      height: 1080,
      fontSize: 48,
      fontName: "Barlow\n,Injected",
    });
    expect(ass).not.toContain("{\\pos(0,0)}");
    expect(ass).not.toContain("Barlow\n");
    expect(ass).toContain("PlayResX: 1920");
  });
  it("wraps long captions into at most two short lines", () => {
    const words = Array.from({ length: 50 }, (_, index) => ({
      text: "example",
      start: index * 0.2,
      end: index * 0.2 + 0.15,
    }));
    const cues = captionCues(words);
    expect(cues.length).toBeGreaterThan(1);
    for (const cue of cues) {
      expect(cue.text.split("\n").length).toBeLessThanOrEqual(2);
      expect(cue.text.split("\n").every((line) => line.length <= 42)).toBe(true);
    }
  });
  it("rejects invalid and overlapping word timing rather than fabricating captions", () => {
    expect(() => captionCues([{ text: "bad", start: 2, end: 1 }])).toThrow(/timing/i);
    expect(() =>
      captionCues([
        { text: "a", start: 0, end: 2 },
        { text: "b", start: 1, end: 3 },
      ]),
    ).toThrow(/timing/i);
  });
});

describe("subtitle positions", () => {
  it.each([
    ["top", 8, 60, 60],
    ["upper-middle", 5, 270, 480],
    ["center", 5, 540, 960],
    ["lower-middle", 5, 810, 1440],
    ["bottom", 2, 1020, 1860],
  ] as const)("places %s captions in both frame formats", (position, anchor, wideY, tallY) => {
    const cues = [{ start: 0, end: 1, text: "Two lines\nof subtitles" }];
    for (const [width, height, y] of [
      [1920, 1080, wideY],
      [1080, 1920, tallY],
    ] as const) {
      const ass = serializeAss(cues, { width, height, fontName: "Barlow", fontSize: 64, position });
      expect(ass).toContain(`{\\an${anchor}\\pos(${width / 2},${y})}Two lines\\Nof subtitles`);
    }
  });
});
