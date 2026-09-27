import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content } from "./recipe-fixture.js";
import { type ResolvedWorkRecipe, recipe } from "./recipe-model.js";
import { thumbnailVariantPrompt } from "./recipe-visual.js";

const drawn: RunConfig = {
  ...config,
  sources: { ...config.sources, thumbnail: "from_prompt" },
  rendered: { ...config.rendered, thumbnailPrompt: "A fox on a cliff, bold title" },
};
const three: RunConfig = { ...drawn, thumbnailCount: 3 };

function recipesFor(c: RunConfig, value: RevisionContent = content): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: content.articleMarkdown ?? null, researchNotes: null },
  });
}
const thumbnails = (recipes: readonly ResolvedWorkRecipe[]) =>
  recipes.filter((value) => value.stage === "thumbnail" && value.key.startsWith("thumbnail:image"));

describe("thumbnail recipes", () => {
  it("keep the one thumbnail and its fingerprint when the setting is absent or one", () => {
    const legacy = recipe({ content }, "thumbnail:image", "thumbnail", {
      kind: "image",
      version: 1,
      provider: "fal",
      model: "image-model",
      aspect: "16:9",
      prompt: "A fox on a cliff, bold title",
    });
    for (const c of [drawn, { ...drawn, thumbnailCount: 1 as const }]) {
      const made = thumbnails(recipesFor(c));
      expect(made.map((value) => value.key)).toEqual(["thumbnail:image"]);
      expect(made[0]?.fingerprint).toBe(legacy.fingerprint);
    }
    // Every other step of the run is untouched too.
    const before = recipesFor(drawn).map((value) => [value.key, value.fingerprint]);
    const after = recipesFor({ ...drawn, thumbnailCount: 1 }).map((value) => [
      value.key,
      value.fingerprint,
    ]);
    expect(after).toEqual(before);
  });

  it("add two more with other compositions, leaving the first as it was", () => {
    const one = thumbnails(recipesFor(drawn));
    const made = thumbnails(recipesFor(three));
    expect(made.map((value) => value.key)).toEqual([
      "thumbnail:image",
      "thumbnail:image:2",
      "thumbnail:image:3",
    ]);
    expect(made[0]?.fingerprint).toBe(one[0]?.fingerprint);
    const prompts = made.map((value) => (value.input.kind === "image" ? value.input.prompt : ""));
    expect(prompts[0]).toBe("A fox on a cliff, bold title");
    expect(prompts[1]).toBe(thumbnailVariantPrompt("A fox on a cliff, bold title", 2));
    expect(prompts[1]).toContain("thumbnail 2 of 3");
    expect(prompts[2]).toContain("thumbnail 3 of 3");
    expect(new Set(made.map((value) => value.fingerprint)).size).toBe(3);
    // The rest of the run does not change when the setting does.
    const rest = (recipes: readonly ResolvedWorkRecipe[]) =>
      recipes
        .filter((value) => !value.key.startsWith("thumbnail:image"))
        .map((value) => [value.key, value.fingerprint]);
    expect(rest(recipesFor(three))).toEqual(rest(recipesFor(drawn)));
  });

  it("regenerate one thumbnail without touching the others", () => {
    const again = recipesFor(three, {
      ...content,
      regenerationTokens: { "thumbnail:image:2": "token" },
    });
    const before = thumbnails(recipesFor(three));
    const after = thumbnails(again);
    expect(after[0]?.fingerprint).toBe(before[0]?.fingerprint);
    expect(after[1]?.fingerprint).not.toBe(before[1]?.fingerprint);
    expect(after[2]?.fingerprint).toBe(before[2]?.fingerprint);
  });

  it("follow the establishing image on every variant", () => {
    const withReference: RunConfig = {
      ...three,
      reference: { source: "prompt", prompt: "Character sheet" },
      rendered: { ...three.rendered, referencePrompt: "Character sheet of a fox" },
    };
    for (const value of thumbnails(recipesFor(withReference))) {
      expect(value.dependsOn).toContain("reference:image");
      expect(value.input).toHaveProperty("reference");
    }
  });

  it("stay one for an uploaded thumbnail and none when it is off", () => {
    expect(
      thumbnails(
        recipesFor(
          { ...three, sources: { ...three.sources, thumbnail: "provide" } },
          { ...content, provided: { thumbnail: "asset" } },
        ),
      ).map((value) => value.key),
    ).toEqual(["thumbnail:image"]);
    expect(
      thumbnails(recipesFor({ ...three, sources: { ...three.sources, thumbnail: "off" } })),
    ).toEqual([]);
  });

  it("mark each variant of a prompt the LLM has not written yet apart", () => {
    const byLlm: RunConfig = {
      ...three,
      sources: { ...three.sources, thumbnail: "prompt_by_llm" },
    };
    const made = thumbnails(recipesFor(byLlm));
    expect(made).toHaveLength(3);
    expect(made.every((value) => value.input.kind === "deferred")).toBe(true);
    expect(new Set(made.map((value) => value.fingerprint)).size).toBe(3);
    const single = thumbnails(recipesFor({ ...byLlm, thumbnailCount: undefined }));
    expect(single[0]?.fingerprint).toBe(made[0]?.fingerprint);
  });
});
