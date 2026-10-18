import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content } from "./recipe-fixture.js";
import { validateRecipeInputs } from "./recipe-validation.js";

const writes: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate" },
  articlePrompt: "Article",
};
const using = { ...content, promptTemplates: { article: "For {{Slopify_Channel}}." } };
const factsMessage =
  "This prompt uses a keyword Slopify fills from the channel and its videos, but this project has no keyword facts yet. Use Refresh keyword facts in Edit project → Prompts, then save again.";

describe("keywords in a saved version", () => {
  it("refuses a fact keyword in a project that has no facts copied, and says how to get them", () => {
    expect(validateRecipeInputs(writes, using)).toContainEqual({
      field: "rendered.article",
      message: factsMessage,
    });
  });

  it("accepts it once the facts are copied", () => {
    expect(
      validateRecipeInputs({ ...writes, keywordFacts: { channel: "Night" } }, using).map(
        (row) => row.message,
      ),
    ).not.toContain(factsMessage);
  });

  it("never asks for a value for a keyword Slopify fills", () => {
    expect(
      validateRecipeInputs(writes, {
        ...content,
        promptTemplates: { article: "About {{Slopify_Title}}." },
      }),
    ).toEqual([]);
  });
});
