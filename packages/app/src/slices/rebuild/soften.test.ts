import { expect, it } from "vitest";
import { softenable } from "./soften.js";

it("softens every refused image of Images and Thumbnail, and only the short stills of Video", () => {
  expect(softenable("images", ["image:1", "image:2"])).toEqual(["image:1", "image:2"]);
  expect(softenable("thumbnail", ["thumbnail:image"])).toEqual(["thumbnail:image"]);
  expect(softenable("video", ["shorts:4:image:6", "clip:2", "shorts:4:render"])).toEqual([
    "shorts:4:image:6",
  ]);
  expect(softenable("article", ["article:body"])).toEqual([]);
});
