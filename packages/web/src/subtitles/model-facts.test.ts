import { alignmentModel } from "@app/adapters/alignment/cache.js";
import { multilingualModel } from "@app/adapters/alignment/multilingual.js";
import { describe, expect, it } from "vitest";
import { englishModelBytes, multilingualModelBytes, subtitleFacts } from "./model-facts";

describe("subtitleFacts", () => {
  it("matches the models the server really downloads", () => {
    expect(englishModelBytes).toBe(alignmentModel.bytes);
    expect(multilingualModelBytes).toBe(multilingualModel.bytes);
  });

  it("names the language and the model it downloads", () => {
    expect(subtitleFacts(undefined)).toMatchObject({ tag: "English · local · no paid API" });
    expect(subtitleFacts("en").detail).toContain("95 MB");
    expect(subtitleFacts("de")).toMatchObject({ tag: "German · local · no paid API" });
    expect(subtitleFacts("de").detail).toContain("248 MB");
    expect(subtitleFacts("ja").tag).toBe("Japanese · by sentence · no paid API");
    expect(subtitleFacts("ja").detail).toContain("Nothing is downloaded");
    expect(subtitleFacts("ja").detail).not.toContain("MB");
  });
});
