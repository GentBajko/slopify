import { describe, expect, it } from "vitest";
import { openingOf, spokenArticle } from "./review-promise.js";

describe("the promise check's opening", () => {
  it("reads the article as it is spoken, without Markdown or end matter", () => {
    expect(spokenArticle("# Rope\n\n**Rope** holds _fast_.\r\n")).toBe("Rope\n\nRope holds fast.");
  });

  it("keeps the words said in the first 30 seconds at 150 a minute", () => {
    const text = Array.from({ length: 100 }, (_value, at) => `w${String(at + 1)}`).join(" ");
    const opening = openingOf(text);
    expect(opening.split(" ")).toHaveLength(75);
    expect(opening.endsWith("w75")).toBe(true);
  });

  it("follows another pace and keeps the text's own line breaks", () => {
    expect(openingOf("One two.\n\nThree four five.", 2, 60)).toBe("One two.");
    expect(openingOf("One two.\n\nThree four five.", 3, 60)).toBe("One two.\n\nThree");
  });

  it("keeps a short article whole and an empty one empty", () => {
    expect(openingOf("Just this.")).toBe("Just this.");
    expect(openingOf("")).toBe("");
  });
});
