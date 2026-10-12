import { alignmentModel, englishModels } from "@app/adapters/alignment/cache.js";
import { multilingualModel } from "@app/adapters/alignment/multilingual.js";
import { describe, expect, it } from "vitest";
import {
  englishModelBytes,
  englishModelChoices,
  multilingualModelBytes,
  subtitleFacts,
} from "./model-facts";

describe("subtitleFacts", () => {
  it("matches the models the server really downloads", () => {
    expect(englishModelBytes).toBe(alignmentModel.bytes);
    expect(multilingualModelBytes).toBe(multilingualModel.bytes);
    for (const choice of englishModelChoices)
      expect(choice.bytes).toBe(englishModels[choice.value].bytes);
    expect(englishModelChoices.map((choice) => choice.value)).toEqual(["fp32", "fp16", "int8"]);
  });

  it("names the language and the model it downloads", () => {
    expect(subtitleFacts(undefined)).toMatchObject({ tag: "English · local · no paid API" });
    expect(subtitleFacts("en").detail).toContain("378 MB");
    expect(subtitleFacts("de")).toMatchObject({ tag: "German · local · no paid API" });
    expect(subtitleFacts("de").detail).toContain("248 MB");
    expect(subtitleFacts("ja").tag).toBe("Japanese · by sentence · no paid API");
    expect(subtitleFacts("ja").detail).toContain("Nothing is downloaded");
    expect(subtitleFacts("ja").detail).not.toContain("MB");
  });
});
