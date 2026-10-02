import { expect, it } from "vitest";
import { thumbnailAspect } from "../../kernel/pipeline.js";
import { subtitleFrame } from "./layout.js";

it("frames each format, square included; a square project's thumbnail stays 16:9", () => {
  expect(subtitleFrame("16:9")).toEqual({ width: 1920, height: 1080 });
  expect(subtitleFrame("9:16")).toEqual({ width: 1080, height: 1920 });
  expect(subtitleFrame("1:1")).toEqual({ width: 1080, height: 1080 });
  expect(thumbnailAspect("1:1")).toBe("16:9");
  expect(thumbnailAspect("9:16")).toBe("9:16");
});
