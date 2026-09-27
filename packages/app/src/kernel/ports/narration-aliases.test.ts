import { describe, expect, it } from "vitest";
import { aliasMatches, applyAliases, type NarrationAlias } from "./narration-aliases.js";

const alias = (written: string, spoken: string, options: Partial<NarrationAlias> = {}) => ({
  written,
  spoken,
  wholeWord: true,
  caseSensitive: false,
  ...options,
});

describe("narration aliases", () => {
  it("replaces whole words, ignoring case unless asked", () => {
    const aliases = [alias("Dr.", "Doctor"), alias("Ms.", "Miss")];
    expect(applyAliases("Dr. Who met ms. Smith and DR. No.", aliases)).toBe(
      "Doctor Who met Miss Smith and Doctor No.",
    );
    expect(applyAliases("US us", [alias("US", "United States", { caseSensitive: true })])).toBe(
      "United States us",
    );
  });
  it("leaves words that only contain the written form unless whole word is off", () => {
    expect(applyAliases("cat catalog", [alias("cat", "kitty")])).toBe("kitty catalog");
    expect(applyAliases("R&D and B&B", [alias("&", " and ", { wholeWord: false })])).toBe(
      "R and D and B and B",
    );
  });
  it("prefers the longest written form and never overlaps", () => {
    const aliases = [alias("St.", "Saint"), alias("St. Louis", "Saint Louis city")];
    expect(aliasMatches("St. Louis and St. Paul", aliases)).toEqual([
      { start: 0, end: 9, spoken: "Saint Louis city" },
      { start: 14, end: 17, spoken: "Saint" },
    ]);
  });
  it("matches a phrase across any run of whitespace", () => {
    expect(applyAliases("et\n  al. wrote", [alias("et al.", "and others")])).toBe(
      "and others wrote",
    );
  });
  it("treats written forms as text, not patterns", () => {
    expect(applyAliases("a+b a.b", [alias("a+b", "A plus B"), alias("a.b", "A dot B")])).toBe(
      "A plus B A dot B",
    );
    expect(applyAliases("axb", [alias("a.b", "A dot B")])).toBe("axb");
  });
});
