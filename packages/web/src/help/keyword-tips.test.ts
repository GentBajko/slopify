import { keywordsFor } from "@app/slices/keywords/specs.js";
import { describe, expect, it } from "vitest";
import { catalog } from "./catalog.js";

// The tips beside each Insert bar list what that kind can use, read from the keyword table, so
// a keyword added there is never missing from the help.
describe("the keyword tips", () => {
  const places = [
    "article",
    "script",
    "narration",
    "image",
    "thumbnail",
    "description",
    "shorts",
    "review",
    "intro",
    "outro",
  ] as const;

  it.each(places)("list every keyword a %s body can use, and only those", (place) => {
    const entry = catalog[`library.keywords.${place}`];
    const listed = [...entry.body.matchAll(/\{\{(Slopify_\w+)\}\}/g)].map((match) => match[1]);
    expect(listed).toEqual(keywordsFor(place).map((spec) => spec.name));
    expect(entry.body).toContain("Keywords Slopify fills here: ");
    expect(entry.tutorial?.page).toBe("Keywords-Slopify-Fills");
  });
});
