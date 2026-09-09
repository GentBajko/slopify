import { describe, expect, it } from "vitest";
import { speechWords } from "./text.js";

describe("subtitle speech normalization", () => {
  it("keeps displayed punctuation and spelling while matching numbers and acronyms", () => {
    const words = speechWords(
      "AI slop from 4chan in the 2010s, around 2022.",
      "A I SLOP FROM FORCHAN IN THE TWO THOUSAND TENS AROUND TWENTY TWENTY TWO",
    );
    expect(words.map((word) => word.text)).toEqual([
      "AI",
      "slop",
      "from",
      "4chan",
      "in",
      "the",
      "2010s,",
      "around",
      "2022.",
    ]);
    expect(words.map((word) => word.spoken)).toEqual([
      "A I",
      "SLOP",
      "FROM",
      "FOURCHAN",
      "IN",
      "THE",
      "TWO THOUSAND TENS",
      "AROUND",
      "TWENTY TWENTY TWO",
    ]);
  });
  it("selects a cardinal number when that is what the recording says", () => {
    expect(speechWords("2022 people", "TWO THOUSAND TWENTY TWO PEOPLE")[0]?.spoken).toBe(
      "TWO THOUSAND TWENTY TWO",
    );
  });
  it("normalizes decimals, currency and percentages without changing the caption", () => {
    expect(speechWords("$12.50 25% 3rd").map((word) => word.spoken)).toEqual([
      "TWELVE POINT FIVE ZERO DOLLARS",
      "TWENTY FIVE PERCENT",
      "THIRD",
    ]);
  });
  it("uses common currency pronunciations when present in the recording", () => {
    expect(speechWords("$12.50", "TWELVE DOLLARS AND FIFTY CENTS")[0]?.spoken).toBe(
      "TWELVE DOLLARS AND FIFTY CENTS",
    );
  });
  it("keeps punctuation-only separators attached to a spoken word", () => {
    expect(speechWords("Hello — world!").map((word) => word.text)).toEqual(["Hello —", "world!"]);
  });
  it("normalizes accents, hyphens and curly apostrophes", () => {
    expect(speechWords("Café AI-generated isn’t").map((word) => word.spoken)).toEqual([
      "CAFE",
      "AI GENERATED",
      "ISN'T",
    ]);
  });
  it("refuses a transcript with no English speech", () => {
    expect(() => speechWords("你好 世界")).toThrow(/English/);
    expect(() => speechWords("Hello 世界")).toThrow(/English/);
  });
});
