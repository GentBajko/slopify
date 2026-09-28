import { describe, expect, it } from "vitest";
import { lineGains, linesOf, parseFrames } from "./line-level.js";

// Ten readings a second at `level` from `from` to `to` seconds.
const frames = (from: number, to: number, level: number) =>
  Array.from({ length: Math.round((to - from) * 10) }, (_value, at) => ({
    t: from + at / 10,
    momentary: level,
  }));

describe("levelling a narration line by line", () => {
  it("groups the timed words into each speaker's lines, on the file's own time", () => {
    const lines = linesOf(
      [
        { start: 2, end: 2.5, speaker: "guard" },
        { start: 2.6, end: 3, speaker: "guard" },
        { start: 3.4, end: 5, speaker: "narrator" },
        { start: 5.5, end: 6, speaker: "guard" },
      ],
      2,
    );
    expect(lines).toEqual([
      { speaker: "guard", start: 0, end: 1 },
      { speaker: "narrator", start: 1.4, end: 3 },
      { speaker: "guard", start: 3.5, end: 4 },
    ]);
  });

  it("brings each line to within 1 LU of the narrator, changing the gain in the pause before it", () => {
    const lines = [
      { speaker: "narrator", start: 0, end: 4 },
      { speaker: "guard", start: 4.4, end: 8 },
      { speaker: "narrator", start: 8.4, end: 12 },
      { speaker: "knight", start: 12.4, end: 16 },
    ];
    const heard = [
      ...frames(0, 4, -20),
      ...frames(4.4, 8, -17),
      ...frames(8.4, 12, -20),
      ...frames(12.4, 16, -20.5),
    ];
    expect(lineGains(lines, heard)).toEqual([
      { at: 0, gainDb: 0 },
      // 3 LU over the narrator: brought down to 1 over.
      { at: 4.2, gainDb: -2 },
      { at: 8.2, gainDb: 0 },
      // Already within 1 LU: left as it is.
      { at: 12.2, gainDb: 0 },
    ]);
  });

  it("never moves a line more than 10 dB, and reads ffmpeg's momentary loudness", () => {
    const lines = [
      { speaker: "narrator", start: 0, end: 4 },
      { speaker: "whisper", start: 4.4, end: 8 },
    ];
    const gains = lineGains(lines, [...frames(0, 4, -20), ...frames(4.4, 8, -40)]);
    expect(gains[1]?.gainDb).toBe(10);
    expect(
      parseFrames(
        "[Parsed_ebur128_0 @ 0x1] t: 0.2   TARGET:-23 LUFS    M: -19.4 S:-20.1     I: -20.0 LUFS\n",
      ),
    ).toEqual([{ t: 0.2, momentary: -19.4 }]);
  });
});
