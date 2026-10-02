import { expect, it } from "vitest";
import type { PackFile } from "./model.js";
import { picked } from "./pick.js";

const file = (asset: string): PackFile => ({
  url: `/files/p/${asset}`,
  asset,
  filename: `${asset}.png`,
  contentType: "image/png",
  bytes: 1,
});

it("puts the picked title and thumbnail first and keeps the others in order", () => {
  const arranged = picked(["Own", "Second", "Third"], [file("a"), file("b"), file("c")], {
    title: 2,
    thumbnail: 1,
  });
  expect(arranged.titles).toEqual(["Third", "Own", "Second"]);
  expect(arranged.thumbnails.map((one) => one.asset)).toEqual(["b", "a", "c"]);
  // A pick past the end, from a list rewritten shorter, falls back to the first.
  expect(picked(["Own"], [file("a")], { title: 2, thumbnail: 2 }).titles).toEqual(["Own"]);
});
