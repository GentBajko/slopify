import { describe, expect, it } from "vitest";
import { agreesWithSpeech } from "./quality.js";

describe("subtitle transcript quality", () => {
  it("accepts small recognition spelling errors", () => {
    expect(agreesWithSpeech("AI SLOP EMERGED FROM FOURCHAN", "A I SLOP EMERGED FROM FORCHAM")).toBe(
      true,
    );
  });
  it("rejects a different recording instead of retaining plausible individual word scores", () => {
    expect(
      agreesWithSpeech(
        "AI SLOP EMERGED FROM FOURCHAN",
        "THE WEATHER TOMORROW WILL BE SUNNY AND WARM",
      ),
    ).toBe(false);
  });
  it("rejects a substantial spoken preamble that is absent from the article", () => {
    expect(
      agreesWithSpeech("HELLO WORLD", "TODAY WE ARE PRESENTING OUR NEW PRODUCT HELLO WORLD"),
    ).toBe(false);
  });
});
