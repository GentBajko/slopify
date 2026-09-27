import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestOutput, RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import { type ResolvedWorkRecipe, recipe } from "./recipe-model.js";

const codex: RunConfig = {
  ...config,
  sources: { ...config.sources, thumbnail: "from_prompt" },
  images: { provider: "codex-image", model: "codex-imagegen" },
  values: { Hero: "a red fox" },
  rendered: {
    ...config.rendered,
    thumbnailPrompt: "Thumbnail",
    referencePrompt: "Character sheet of a red fox",
  },
};
const drawn: RunConfig = { ...codex, reference: { source: "prompt", prompt: "Character sheet" } };
const templates: RevisionContent = {
  ...content,
  promptTemplates: { referencePrompt: "Character sheet of {{Hero}}" },
};

function recipesFor(
  c: RunConfig,
  value: RevisionContent = templates,
  outputs: readonly ManifestOutput[] = [],
): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs, pieces: [] },
    resolved: { articleMarkdown: content.articleMarkdown ?? null, researchNotes: null },
  });
}
const find = (recipes: readonly ResolvedWorkRecipe[], key: string) => {
  const found = recipes.find((value) => value.key === key);
  if (found === undefined) throw new Error(`no ${key}`);
  return found;
};

describe("image recipes without the new settings", () => {
  it("keep the fingerprint a Codex default image always had", () => {
    const image = find(recipesFor(codex), "image:harbor");
    // Exactly the request shape saved before the model, effort and reference existed.
    expect(image.input).toEqual({
      kind: "image",
      version: 1,
      provider: "codex-image",
      model: "codex-imagegen",
      aspect: "16:9",
      prompt: "Harbor",
    });
    const legacy = recipe({ content: templates }, "image:harbor", "images", {
      kind: "image",
      version: 1,
      provider: "codex-image",
      model: "codex-imagegen",
      prompt: "Harbor",
      aspect: "16:9",
    });
    expect(image.fingerprint).toBe(legacy.fingerprint);
    expect(image.fingerprint).toBe(
      "988bec8b631a79ac0873ce372499ab346c4380c0a9d4eb487defb8f1717d7c2e",
    );
    expect(image.dependsOn).toEqual([]);
    expect(recipesFor(codex).some((value) => value.key === "reference:image")).toBe(false);
  });

  it("carry a chosen model and effort, and only then", () => {
    const chosen = find(
      recipesFor({
        ...codex,
        images: { provider: "codex-image", model: "gpt-6-sol", thinking: "ultra" },
      }),
      "image:harbor",
    );
    expect(chosen.input).toMatchObject({ model: "gpt-6-sol", thinking: "ultra" });
    expect(chosen.fingerprint).not.toBe(find(recipesFor(codex), "image:harbor").fingerprint);
  });
});

describe("the establishing image", () => {
  it("is made first from its prompt with the run's keywords and never joins the video", () => {
    const recipes = recipesFor(drawn);
    const reference = find(recipes, "reference:image");
    expect(reference.stage).toBe("images");
    expect(reference.input).toMatchObject({
      kind: "image",
      provider: "codex-image",
      model: "codex-imagegen",
      prompt: "Character sheet of a red fox",
    });
    const video = find(recipes, "export:video");
    expect(video.dependsOn).not.toContain("reference:image");
    expect(JSON.stringify(video.input)).not.toContain(reference.fingerprint);
  });

  it("is what every other image, and the thumbnail by default, is drawn from", () => {
    const recipes = recipesFor(drawn);
    const reference = find(recipes, "reference:image");
    for (const key of ["image:harbor", "image:hill", "thumbnail:image"]) {
      const image = find(recipes, key);
      expect(image.dependsOn).toContain("reference:image");
      expect(image.input).toMatchObject({
        reference: { fingerprint: reference.fingerprint, assetId: null },
      });
    }
    const without = recipesFor({
      ...drawn,
      reference: { source: "prompt", prompt: "Character sheet", thumbnail: false },
    });
    expect(find(without, "thumbnail:image").dependsOn).not.toContain("reference:image");
    expect(find(without, "thumbnail:image").input).not.toHaveProperty("reference");
    expect(find(without, "thumbnail:image").fingerprint).toBe(
      find(recipesFor(codex), "thumbnail:image").fingerprint,
    );
  });

  it("marks the images drawn from it outdated when it is changed or made again", () => {
    const before = recipesFor(drawn);
    const regenerated = recipesFor(drawn, {
      ...templates,
      regenerationTokens: { "reference:image": "again" },
    });
    const edited = recipesFor(drawn, {
      ...templates,
      promptTemplates: { referencePrompt: "Portrait of {{Hero}}" },
    });
    for (const after of [regenerated, edited]) {
      expect(find(after, "reference:image").fingerprint).not.toBe(
        find(before, "reference:image").fingerprint,
      );
      for (const key of ["image:harbor", "image:hill", "thumbnail:image"])
        expect(find(after, key).fingerprint).not.toBe(find(before, key).fingerprint);
    }
  });

  it("names the asset it made once it has landed", () => {
    const reference = find(recipesFor(drawn), "reference:image");
    const landed = recipesFor(drawn, templates, [
      {
        slot: "images:reference",
        workKey: "reference:image",
        assetId: "asset-reference",
        fingerprint: reference.fingerprint,
        state: "ready",
        output: {
          id: "output-reference",
          projectId: "p1",
          stageKind: "images",
          role: "reference",
          path: "assets/reference.png",
          originalFilename: null,
          bytes: 10,
          durationMs: null,
          meta: {},
          createdAt: "2026-09-10T00:00:00Z",
        },
      },
    ]);
    expect(find(landed, "image:harbor").input).toMatchObject({
      reference: { fingerprint: reference.fingerprint, assetId: "asset-reference" },
    });
  });

  it("uses an uploaded image as it is", () => {
    const uploaded = recipesFor(
      { ...codex, reference: { source: "provide" } },
      { ...templates, provided: { reference: "asset-upload" } },
    );
    expect(find(uploaded, "reference:image").input).toEqual({
      kind: "provided",
      version: 1,
      assetId: "asset-upload",
      semantic: "reference",
    });
    expect(find(uploaded, "image:harbor").dependsOn).toContain("reference:image");
  });

  it("is off while images are not generated", () => {
    const off = recipesFor({
      ...drawn,
      sources: { ...drawn.sources, images: "off", video: "off" },
    });
    expect(off.some((value) => value.key === "reference:image")).toBe(false);
    expect(find(off, "thumbnail:image").input).not.toHaveProperty("reference");
  });
});
