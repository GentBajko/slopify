import { expect, it } from "vitest";
import { assColour, assText } from "./ass-text.js";

it("escapes override braces and backslashes, collapsing prose spaces", () => {
  expect(assText("{\\b1}Bold  \\N one")).toBe("\\{\\\\b1\\}Bold \\\\N one");
  expect(assText("a   b", true)).toBe("a\\h\\h\\hb");
});

it("writes a colour as ASS reads it and falls back to white", () => {
  expect(assColour("#a6d45c")).toBe("&H5CD4A6&");
  expect(assColour("lime")).toBe("&HFFFFFF&");
});
