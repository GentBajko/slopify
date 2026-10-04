import { describe, expect, it } from "vitest";
import { contrastRatio, contrastWarning, hexProblem, parseHex } from "./hex-colour";

describe("hex colours", () => {
  it("takes three or six digits, with or without #, and keeps nothing partial", () => {
    expect(parseHex("#8C1E14")).toBe("#8c1e14");
    expect(parseHex("8c1e14")).toBe("#8c1e14");
    expect(parseHex("#abc")).toBe("#aabbcc");
    expect(parseHex("#8c1")).toBe("#88cc11");
    expect(parseHex("#8c1e")).toBeUndefined();
    expect(parseHex("")).toBeUndefined();
    expect(hexProblem("")).toBeUndefined();
    expect(hexProblem("#12")).toContain("3 or 6 hex digits");
  });

  it("measures contrast and warns only below the minimum", () => {
    expect(contrastRatio("#000", "#fff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777", "#12")).toBeUndefined();
    expect(contrastWarning("#000000", "#ffffff", "the page colour", 4.5)).toBeUndefined();
    expect(contrastWarning("#eeeeee", "#ffffff", "the page colour", 4.5)).toMatch(
      /^Hard to read on the page colour: contrast 1\.2:1/,
    );
  });
});
