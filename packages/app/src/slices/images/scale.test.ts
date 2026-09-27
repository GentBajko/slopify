import { describe, expect, it } from "vitest";
import type { RunDraft } from "../admission/model.js";
import {
  imageCountsOf,
  imageScaleForm,
  imageScaleProblem,
  imagesPerVideoMax,
  perHourFromMinutes,
  plannedImageCount,
  scaledImagesMax,
  scaledTarget,
  wordCount,
} from "./scale.js";

const sources: RunDraft["sources"] = {
  research: "off",
  article: "generate",
  audio: "generate",
  images: "generate",
  thumbnail: "off",
  video: "generate",
};
const prompts = [
  { name: "wide", number: 3 },
  { name: "close", number: 1 },
  { name: "detail", number: 2 },
];

describe("scaledTarget", () => {
  it("asks for one image per started stretch of the expected narration", () => {
    // 9,000 words at 150 a minute is an hour.
    expect(scaledTarget({ perHour: 30, words: 9000 })).toBe(30);
    expect(scaledTarget({ perHour: perHourFromMinutes(2), words: 9000 })).toBe(30);
    expect(scaledTarget({ perHour: 30, words: 9001 })).toBe(31);
    // Every 7 minutes, stored rounded, still asks for 60 / 7 → 9 images in an hour.
    expect(scaledTarget({ perHour: perHourFromMinutes(7), words: 9000 })).toBe(9);
  });

  it("stops at the scaled cap", () => {
    expect(scaledTarget({ perHour: 240, words: 100000 })).toBe(scaledImagesMax);
  });
});

describe("imageCountsOf", () => {
  it("is each prompt's Number when the setting is absent", () => {
    expect(imageCountsOf({ imagePrompts: prompts, sources })).toEqual([3, 1, 2]);
    expect(plannedImageCount({ imagePrompts: prompts, sources })).toBe(6);
  });

  it("hands the extra images to the ticked prompts one at a time, in prompt order", () => {
    // Two hours at one every 5 minutes: 24 images, 18 more than the prompts' 6.
    const imageScale = { perHour: 12, words: 18000 };
    expect(imageCountsOf({ imagePrompts: prompts, imageScale, sources })).toEqual([9, 7, 8]);
    expect(plannedImageCount({ imagePrompts: prompts, imageScale, sources })).toBe(24);
    const one = { perHour: 12, words: 18000 + 150 * 5 };
    expect(imageCountsOf({ imagePrompts: prompts, imageScale: one, sources })).toEqual([10, 7, 8]);
  });

  it("keeps the prompts' Numbers as the floor", () => {
    const imageScale = { perHour: 1, words: 1500 };
    expect(imageCountsOf({ imagePrompts: prompts, imageScale, sources })).toEqual([3, 1, 2]);
  });

  it("ignores the setting unless the images are generated", () => {
    const imageScale = { perHour: 60, words: 9000 };
    expect(
      imageCountsOf({ imagePrompts: prompts, imageScale, sources: { ...sources, images: "off" } }),
    ).toEqual([3, 1, 2]);
  });

  it("plans the same counts every time", () => {
    const draft = { imagePrompts: prompts, imageScale: { perHour: 20, words: 27000 }, sources };
    expect(imageCountsOf(draft)).toEqual(imageCountsOf(draft));
    expect(plannedImageCount(draft)).toBe(60);
  });
});

describe("the rest of the setting", () => {
  it("reads the stored rate back the way Play spells it", () => {
    expect(imageScaleForm({ perHour: perHourFromMinutes(7), words: 1 })).toEqual({
      every: "minutes",
      value: "7",
    });
    expect(imageScaleForm({ perHour: 12, words: 1 })).toEqual({ every: "minutes", value: "5" });
    expect(imageScaleForm({ perHour: 7, words: 1 })).toEqual({ every: "hour", value: "7" });
  });

  it("raises a project's image cap only when it scales", () => {
    expect(imagesPerVideoMax({})).toBe(60);
    expect(imagesPerVideoMax({ imageScale: { perHour: 12, words: 1500 } })).toBe(240);
  });

  it("names the control when a stored value is out of range", () => {
    expect(imageScaleProblem({ perHour: 12, words: 1500 })).toBeUndefined();
    expect(imageScaleProblem({ perHour: 0.5, words: 1500 })).toContain(
      "Images → More images for long videos",
    );
    expect(imageScaleProblem({ perHour: 12, words: 0 })).toContain("expected words (Review)");
  });

  it("counts words the way a reader would", () => {
    expect(wordCount("  One two\n\nthree  ")).toBe(3);
    expect(wordCount("")).toBe(0);
  });
});
