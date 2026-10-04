import { describe, expect, it } from "vitest";
import { thumbnailProblem } from "./review-thumbnail.js";
import {
  chunkOfLine,
  chunkTexts,
  lineAt,
  placeLine,
  segmentStarts,
  timedLines,
} from "./review-timing.js";

const timing = JSON.stringify({
  words: [
    { text: "Hello", start: 0.5, end: 0.9, speaker: "host" },
    { text: "there.", start: 1, end: 1.4, speaker: "host" },
    { text: "Welcome", start: 3, end: 3.5, speaker: "guest" },
    { text: "back.", start: 3.6, end: 4 },
  ],
});

describe("timedLines", () => {
  it("makes one line per caption cue, keeping each speaker", () => {
    expect(timedLines(timing)).toEqual([
      { start: 0.5, end: 1.4, text: "Hello there.", speaker: "host" },
      { start: 3, end: 3.5, text: "Welcome", speaker: "guest" },
      { start: 3.6, end: 4, text: "back." },
    ]);
  });

  it("reads damaged or missing timing as no lines", () => {
    expect(timedLines(undefined)).toEqual([]);
    expect(timedLines("{not json")).toEqual([]);
    expect(timedLines(JSON.stringify({ words: "no" }))).toEqual([]);
  });
});

describe("segmentStarts and placeLine", () => {
  const seconds = { intro: 10, body: 100, outro: 5 };
  const starts = segmentStarts({ edgeSeconds: 1, gapSeconds: 2, seconds });

  it("lays the segments out with the lead-in and the gaps, as the video does", () => {
    expect(starts).toEqual({ intro: 1, body: 13, outro: 115 });
  });

  it("puts a line in its segment at the segment's own time", () => {
    if (starts === undefined) throw new Error("Expected starts.");
    expect(placeLine({ start: 20, end: 22, text: "x" }, starts, seconds)).toEqual({
      segment: "body",
      start: 7,
      end: 9,
    });
    expect(placeLine({ start: 116, end: 117, text: "x" }, starts, seconds)?.segment).toBe("outro");
  });

  it("needs the body's length", () => {
    expect(segmentStarts({ edgeSeconds: 1, gapSeconds: 1, seconds: { intro: 3 } })).toBeUndefined();
  });
});

describe("lineAt", () => {
  const lines = [
    { start: 0, end: 1 },
    { start: 2, end: 3 },
  ];
  it("holds the last line started through the pause after it", () => {
    expect(lineAt(lines, 1.5)).toBe(0);
    expect(lineAt(lines, 2.5)).toBe(1);
  });
  it("is none before the first line", () => {
    expect(lineAt([{ start: 1, end: 2 }], 0.2)).toBe(-1);
  });
});

describe("chunkOfLine", () => {
  const chunks = [
    { text: "The tower stood alone on the hill, older than the town." },
    { text: "Nobody remembered who had built it, or why." },
  ];
  it("finds the chunk a line was spoken from, ignoring case and punctuation", () => {
    expect(chunkOfLine(chunkTexts(chunks), "nobody remembered who had built it")).toBe(1);
    expect(chunkOfLine(chunkTexts(chunks), "The tower stood alone, on the hill")).toBe(0);
  });
  it("is none for words no chunk holds", () => {
    expect(chunkOfLine(chunkTexts(chunks), "Something else entirely")).toBeUndefined();
  });
});

describe("thumbnailProblem", () => {
  it("accepts YouTube Studio's desktop limit and refuses past it, saying what to do", () => {
    expect(thumbnailProblem(49 * 1024 * 1024)).toBeUndefined();
    expect(thumbnailProblem(51 * 1024 * 1024)).toContain("up to 50 MB");
    expect(thumbnailProblem(51 * 1024 * 1024)).toContain("Replace provided thumbnail");
  });
});
