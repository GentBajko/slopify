import { describe, expect, it } from "vitest";
import { promiseItemKey } from "./model.js";
import { reviewedOutputKey } from "./view.js";

describe("the output a verdict is about", () => {
  it("is the article for the promise check, as for the article review", () => {
    expect(reviewedOutputKey(promiseItemKey)).toBe("article:body");
    expect(reviewedOutputKey("article:body")).toBe("article:body");
  });

  it("is the word timing for the narration, a short's render, or the item itself", () => {
    expect(reviewedOutputKey("narration")).toBe("subtitles:timing");
    expect(reviewedOutputKey("shorts:2")).toBe("shorts:2:render");
    expect(reviewedOutputKey("image:one")).toBe("image:one");
  });
});
