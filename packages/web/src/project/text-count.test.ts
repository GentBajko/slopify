import { expect, it } from "vitest";
import { textCount } from "./body-article.js";

it("counts the words and characters of the article as read, without its markdown", () => {
  expect(textCount("## A heading\n\nOne *two* [three](https://x.test) — four.")).toBe(
    "6 words · 31 characters",
  );
  expect(textCount("Word")).toBe("1 word · 4 characters");
});
