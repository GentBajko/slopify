import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { config, content } from "./recipe-fixture.js";
import { keywordBodies, validateRecipeInputs } from "./recipe-validation.js";

const writes: RunConfig = {
  ...config,
  sources: { ...config.sources, article: "generate" },
  articlePrompt: "Article",
};
const using = { ...content, promptTemplates: { article: "For {{Slopify_Channel}}." } };
const factsMessage =
  "This prompt uses a keyword Slopify fills from the channel and its videos, but this project has no keyword facts yet. Use Refresh keyword facts in Edit settings → Title and keywords, then save again.";

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

  it("refuses a keyword where it can't be filled", () => {
    expect(
      validateRecipeInputs(writes, {
        ...content,
        promptTemplates: { article: "Recap {{Slopify_Chapters}}." },
      }).map((row) => row.field),
    ).toEqual(["rendered.article"]);
  });

  it("needs a text model for the keyword digest", () => {
    const { llm: _none, ...rest } = config;
    expect(
      validateRecipeInputs(
        { ...rest, sources: { ...config.sources, thumbnail: "from_prompt" }, thumbnailPrompt: "T" },
        { ...content, promptTemplates: { thumbnailPrompt: "{{Slopify_Hook}}" } },
      ),
    ).toContainEqual({ field: "llm", message: "Choose a Service and a Model under Written by." });
  });

  it("lists every body a version runs with its place, the reviews' prompts too", () => {
    expect(
      keywordBodies(
        {
          ...writes,
          reviews: {
            provider: "p",
            model: "m",
            stages: { article: { mode: "flag", prompt: "R" } },
          },
        },
        {
          ...content,
          promptTemplates: { article: "A", "review.article": "Check {{Slopify_Title}}" },
        },
      ).map((one) => [one.field, one.place]),
    ).toEqual([
      ["rendered.article", "article"],
      ["content.imageDefinitions.harbor.prompt", "image"],
      ["content.imageDefinitions.hill.prompt", "image"],
      ["rendered.review.article", "review"],
    ]);
  });

  it("refuses the release date in a Text outro", () => {
    expect(
      validateRecipeInputs(
        {
          ...config,
          sources: { ...config.sources, audio: "generate" },
          audio: { provider: "v", model: "m", voice: "x" },
          outro: { name: "Bye", mode: "text" },
        },
        { ...content, promptTemplates: { outro: "Next on {{Slopify_Release_Date}}" } },
      ).map((row) => row.field),
    ).toContain("rendered.outro");
  });
});
