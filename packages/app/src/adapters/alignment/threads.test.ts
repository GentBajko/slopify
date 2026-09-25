import { describe, expect, it } from "vitest";
import { subtitleThreads } from "./threads.js";

describe("subtitle inference threads", () => {
  it("leaves one CPU free and stops at eight", () => {
    expect(subtitleThreads({}, 1)).toBe(1);
    expect(subtitleThreads({}, 2)).toBe(1);
    expect(subtitleThreads({}, 4)).toBe(3);
    expect(subtitleThreads({}, 9)).toBe(8);
    expect(subtitleThreads({}, 32)).toBe(8);
  });
  it("uses SLOPIFY_SUBTITLE_THREADS when it is a positive whole number", () => {
    expect(subtitleThreads({ SLOPIFY_SUBTITLE_THREADS: "16" }, 32)).toBe(16);
    expect(subtitleThreads({ SLOPIFY_SUBTITLE_THREADS: " 2 " }, 32)).toBe(2);
    for (const value of ["", "0", "-3", "1.5", "many"])
      expect(subtitleThreads({ SLOPIFY_SUBTITLE_THREADS: value }, 32)).toBe(8);
  });
});
