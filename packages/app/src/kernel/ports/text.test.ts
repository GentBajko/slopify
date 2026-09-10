import { expect, it } from "vitest";
import { splitText } from "./text.js";

it.each(["An article. ".repeat(8000), "word ".repeat(18000), "a".repeat(82687), "😀".repeat(9000)])(
  "splits text without losing content or exceeding a limit",
  (text) => {
    const parts = splitText(text, 10000);
    expect(parts.join("")).toBe(text);
    expect(parts.every((p) => p.length <= 10000)).toBe(true);
    expect(parts.every((p) => !/[\uD800-\uDBFF]$/.test(p))).toBe(true);
  },
);
