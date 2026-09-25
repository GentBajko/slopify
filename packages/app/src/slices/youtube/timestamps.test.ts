import { describe, expect, it } from "vitest";
import { parseTimestamp, youtubeTimestamp } from "./timestamps.js";

describe("youtubeTimestamp", () => {
  it("writes M:SS under an hour and H:MM:SS from the first hour on", () => {
    expect(youtubeTimestamp(0)).toBe("0:00");
    expect(youtubeTimestamp(135)).toBe("2:15");
    expect(youtubeTimestamp(1123.9)).toBe("18:43");
    expect(youtubeTimestamp(3599)).toBe("59:59");
    expect(youtubeTimestamp(3600)).toBe("1:00:00");
    expect(youtubeTimestamp(3723)).toBe("1:02:03");
  });

  it("rounds down, so a chapter never starts after its first word", () => {
    expect(youtubeTimestamp(2.99)).toBe("0:02");
    expect(youtubeTimestamp(-1)).toBe("0:00");
  });
});

describe("parseTimestamp", () => {
  it("reads M:SS, MM:SS and H:MM:SS", () => {
    expect(parseTimestamp("0:00")).toBe(0);
    expect(parseTimestamp("02:15")).toBe(135);
    expect(parseTimestamp(" 18:43 ")).toBe(1123);
    expect(parseTimestamp("1:02:03")).toBe(3723);
  });

  it("refuses anything else", () => {
    for (const text of ["", "0", "1:2", "0:60", "1:60:00", "2m15s", "0:00 Intro", "-0:10"])
      expect(parseTimestamp(text)).toBeUndefined();
  });
});
