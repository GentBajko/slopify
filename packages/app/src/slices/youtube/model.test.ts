import { describe, expect, it } from "vitest";
import {
  hashtagNote,
  hashtagsMax,
  youtubeDescriptionProblem,
  youtubeTitleProblem,
} from "./model.js";

describe("YouTube's limits", () => {
  it("takes a title up to 100 characters without < or >", () => {
    expect(youtubeTitleProblem("x".repeat(100))).toBeUndefined();
    expect(youtubeTitleProblem("x".repeat(101))).toMatch(/up to 100 characters; this one has 101/);
    expect(youtubeTitleProblem("A <b> title")).toMatch(/< or > in a title/);
  });

  it("takes a description up to 5,000 characters without < or >", () => {
    expect(youtubeDescriptionProblem("Fine.")).toBeUndefined();
    expect(youtubeDescriptionProblem("x".repeat(5001))).toMatch(
      /5,000 characters; this one has 5,001/,
    );
    expect(youtubeDescriptionProblem("1 < 2")).toMatch(/< or > in a description/);
  });

  it("warns about hashtags only past YouTube's 60", () => {
    expect(hashtagsMax).toBe(60);
    expect(hashtagNote("")).toBeUndefined();
    expect(hashtagNote("#One #Two")).toBe("2 hashtags; the first 2 show above the title.");
    const many = Array.from({ length: 20 }, (_, at) => `#T${String(at)}`).join(" ");
    expect(hashtagNote(many)).toBe("20 hashtags; the first 3 show above the title.");
    const tooMany = Array.from({ length: 61 }, (_, at) => `#T${String(at)}`).join(" ");
    expect(hashtagNote(tooMany)).toMatch(
      /^61 hashtags: YouTube ignores every hashtag .* Remove 1\.$/,
    );
  });
});
