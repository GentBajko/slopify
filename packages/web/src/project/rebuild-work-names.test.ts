import { expect, it } from "vitest";
import { workName } from "./rebuild-work-names.js";

it("names shorts work by short and step", () => {
  expect(
    [
      "shorts:pick",
      "shorts:future",
      "shorts:2:prompts",
      "shorts:2:image:3",
      "shorts:12:render",
    ].map(workName),
  ).toEqual([
    "Shorts: pick the moments",
    "Shorts: prompts, images and renders",
    "Short 2: image prompts",
    "Short 2: image 3",
    "Short 12: render",
  ]);
});
