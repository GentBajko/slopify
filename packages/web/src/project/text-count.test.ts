import { expect, it } from "vitest";
import { spokenLength, textCount } from "./body-article.js";

it("counts the words and characters of the article as read, without its markdown", () => {
  expect(textCount("## A heading\n\nOne *two* [three](https://x.test) — four.")).toBe(
    "6 words · 31 characters · about 1 min read aloud",
  );
  expect(textCount("Word")).toBe("1 word · 4 characters · about 1 min read aloud");
});

it("says how long the text takes to read aloud at about 150 words a minute", () => {
  expect(spokenLength(1500)).toBe("about 10 min read aloud");
  expect(spokenLength(18_300)).toBe("about 2 h 2 min read aloud");
  expect(spokenLength(9000)).toBe("about 1 h read aloud");
});
