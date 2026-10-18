import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// {{Slopify_Scene}}, {{Slopify_Setting}} and {{Slopify_Mood}} turn scenes on for the picture
// whose prompt uses them, whatever Images → Scenes from the article says.
const two: RunConfig = {
  ...config,
  imagePrompts: [
    { name: "Wide", number: 1 },
    { name: "Plain", number: 1 },
  ],
};
const templates = (wide: string, plain = "A plain picture."): RevisionContent => ({
  ...content,
  imageDefinitions: {
    harbor: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.0" },
    hill: { source: "generate", assetId: null, prompt: null, templateKey: "imagePrompts.1" },
  },
  promptTemplates: { "imagePrompts.0": wide, "imagePrompts.1": plain },
});

function plan(
  c: RunConfig,
  value: RevisionContent,
  pieces: readonly ManifestPiece[] = [],
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: "First paragraph.\n\nSecond paragraph.", researchNotes: null },
  });
}
const find = (recipes: readonly ResolvedWorkRecipe[], key: string): ResolvedWorkRecipe => {
  const found = recipes.find((value) => value.key === key);
  if (found === undefined) throw new Error(`Missing ${key}`);
  return found;
};
function done(key: string, fingerprint: string, payload: unknown, stage = "images"): ManifestPiece {
  return {
    key,
    stageKind: stage === "images" ? "images" : "thumbnail",
    assetId: null,
    fingerprint,
    piece: {
      id: `piece-${key}`,
      stageId: stage,
      kind: "article_written",
      idx: 1,
      state: "done",
      payload: JSON.stringify(payload),
    },
  };
}
const asked = (value: ResolvedWorkRecipe): string =>
  value.input.kind === "llm" ? value.input.messages.map((one) => one.content).join("\n") : "";

describe("scene keywords with Scenes from the article off", () => {
  it("writes scenes only for the pictures whose prompts ask, and draws the others as always", () => {
    const value = templates("Draw it.\n\nScene: {{Slopify_Scene}}");
    const first = plan(two, value);
    const scenes = find(first, "images:scenes");
    expect(asked(scenes)).toContain("Pictures: 1");
    expect(find(first, "image:harbor").input.kind).toBe("deferred");
    expect(find(first, "image:hill").input).toMatchObject({
      kind: "image",
      prompt: "A plain picture.",
    });
    const answered = plan(two, value, [
      done("images:scenes", scenes.fingerprint, { scenes: ["The gate at dawn."] }),
    ]);
    expect(find(answered, "image:harbor").input).toMatchObject({
      kind: "image",
      prompt: "Draw it.\n\nScene: The gate at dawn.",
    });
  });

  it("adds no scene line to a prompt asking only for the setting, and drops an old Scene line", () => {
    const value = templates("Draw it.\n\nOld: {{Scene}}\n\nWhen: {{Slopify_Setting}}");
    const scenes = find(plan(two, value), "images:scenes");
    expect(asked(scenes)).toContain('each {"scene": "…", "setting": "…", "mood": "…"}');
    const answered = plan(two, value, [
      done("images:scenes", scenes.fingerprint, {
        scenes: ["The gate."],
        details: [{ setting: "Rome, 50 BC", mood: "calm" }],
      }),
    ]);
    expect(find(answered, "image:harbor").input).toMatchObject({
      prompt: "Draw it.\n\nWhen: Rome, 50 BC",
    });
  });

  it("leaves the old {{Scene}} following the switch, as it always did", () => {
    const recipes = plan(two, templates("Draw it.\n\nScene: {{Scene}}"));
    expect(recipes.some((value) => value.key === "images:scenes")).toBe(false);
    expect(find(recipes, "image:harbor").input).toMatchObject({ prompt: "Draw it." });
  });

  it("gives the thumbnail its own scene even when the images are not generated", () => {
    const c: RunConfig = {
      ...config,
      sources: { ...config.sources, images: "off", thumbnail: "from_prompt" },
      thumbnailPrompt: "Thumb",
    };
    const value = { ...content, promptTemplates: { thumbnailPrompt: "Bold. {{Slopify_Scene}}" } };
    const first = plan(c, value);
    const scenes = find(first, "thumbnail:scenes");
    expect(find(first, "thumbnail:image").input.kind).toBe("deferred");
    const answered = plan(c, value, [
      done("thumbnail:scenes", scenes.fingerprint, { scenes: ["The gate."] }, "thumbnail"),
    ]);
    expect(find(answered, "thumbnail:image").input).toMatchObject({ prompt: "Bold. The gate." });
  });
});

describe("scene keywords with Scenes from the article on", () => {
  it("still gives every image its scene, and fills the mood where asked", () => {
    const value = templates("Draw it.\n\nFeel: {{Slopify_Mood}}");
    const c: RunConfig = { ...two, imageScenes: true };
    const scenes = find(plan(c, value), "images:scenes");
    expect(asked(scenes)).toContain("Pictures: 2");
    const answered = plan(c, value, [
      done("images:scenes", scenes.fingerprint, {
        scenes: ["The gate.", "The hill."],
        details: [{ mood: "tense" }, {}],
      }),
    ]);
    expect(find(answered, "image:harbor").input).toMatchObject({
      prompt: "Draw it.\n\nScene: The gate.\n\nFeel: tense",
    });
    expect(find(answered, "image:hill").input).toMatchObject({
      prompt: "A plain picture.\n\nScene: The hill.",
    });
  });
});
