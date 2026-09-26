import { expect, it } from "vitest";
import { shortImageCount, shortsImageUpperBound, shortsSettingsProblems } from "./model.js";

it("gives a clip one image per stretch of imageSeconds, the last running to the end", () => {
  expect(shortImageCount(60, 15)).toBe(4);
  expect(shortImageCount(61, 15)).toBe(5);
  expect(shortImageCount(14, 15)).toBe(1);
  // A few milliseconds past a whole number of images is timing noise, not another image.
  expect(shortImageCount(60.0004, 15)).toBe(4);
  expect(shortImageCount(Number.NaN, 15)).toBe(1);
});

it("charges the most the step can ask for: every clip at the longest length", () => {
  expect(shortsImageUpperBound({ count: 3, maxSeconds: 120 }, 15)).toBe(24);
  expect(shortsImageUpperBound({ count: 10, maxSeconds: 180 }, 7)).toBe(260);
});

it("says what is wrong with each number in plain words", () => {
  expect(shortsSettingsProblems({ count: 3, minSeconds: 60, maxSeconds: 120 })).toEqual([]);
  expect(shortsSettingsProblems({ count: 0, minSeconds: 10, maxSeconds: 200.5 })).toEqual([
    { field: "count", message: "Enter a whole number of shorts between 1 and 10." },
    { field: "minSeconds", message: "Enter a whole number of seconds between 15 and 180." },
    { field: "maxSeconds", message: "Enter a whole number of seconds between 15 and 180." },
  ]);
  const message =
    "The longest a short may be must be at least the shortest. Raise the maximum or lower the minimum.";
  expect(shortsSettingsProblems({ count: 3, minSeconds: 90, maxSeconds: 60 })).toEqual([
    { field: "minSeconds", message },
    { field: "maxSeconds", message },
  ]);
});
