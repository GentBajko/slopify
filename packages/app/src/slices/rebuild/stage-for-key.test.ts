import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import { stageForKey } from "./transition-repo.js";

// A restore plans every step by its key; each key the planner makes has to name its stage, or
// History → Restore stops with "unknown kind of step".
it("knows the stage of every step the planner makes", () => {
  const full: RunConfig = {
    ...config,
    sources: { ...config.sources, thumbnail: "from_prompt" },
    imagePrompts: [{ name: "Wide", number: 2 }],
    imageScenes: true,
    youtubeDescription: true,
    rendered: { ...config.rendered, thumbnailPrompt: "A thumbnail. {{Scene}}" },
  };
  const recipes = buildRecipes({
    config: full,
    content: {
      ...content,
      imageDefinitions: {
        harbor: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
        hill: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
      },
      promptTemplates: {
        "imagePrompts.0": "An engraving.\n\nLooks: {{Appearance}}",
        thumbnailPrompt: "A thumbnail.\n\nScene: {{Scene}}",
      },
    },
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: "Text.", researchNotes: null },
  });
  expect(recipes.some((value) => value.key === "images:scenes")).toBe(true);
  expect(recipes.some((value) => value.key === "images:appearance")).toBe(true);
  for (const value of recipes)
    expect([value.key, stageForKey(value.key)]).toEqual([value.key, value.stage]);
  expect(
    ["level:body", "shorts:1:render", "youtube:description", "animate:harbor", "figure:card:1"].map(
      stageForKey,
    ),
  ).toEqual(["audio", "video", "video", "video", "images"]);
});
