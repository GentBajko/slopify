import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { planRevision } from "./recipes.js";

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
};

function recipesFor(c: RunConfig) {
  const view = emptyView(c);
  return buildRecipes({
    config: c,
    content,
    manifest: view,
    resolved: { articleMarkdown: view.articleMarkdown, researchNotes: null },
  });
}

function fingerprints(c: RunConfig): Readonly<Record<string, string>> {
  const planned = planRevision(emptyView(c), { config: c, content });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planned.fingerprints;
}

const reviewer = { provider: "codex", model: "gpt" } as const;

describe("review recipes", () => {
  it("leaves every step and fingerprint as it was with reviews off", () => {
    const before = fingerprints(narrated);
    expect(fingerprints({ ...narrated, reviews: { ...reviewer, stages: {} } })).toEqual(before);
    expect(
      fingerprints({
        ...narrated,
        reviews: { ...reviewer, stages: { images: { mode: "off" }, narration: { mode: "off" } } },
      }),
    ).toEqual(before);
    // A review of a stage that makes nothing (the article is provided) adds nothing either.
    expect(
      fingerprints({
        ...narrated,
        reviews: { ...reviewer, stages: { article: { mode: "redo" } } },
      }),
    ).toEqual(before);
    expect(recipesFor(narrated).map((row) => row.dependsOn)).toEqual(
      recipesFor({ ...narrated, reviews: { ...reviewer, stages: {} } }).map((row) => row.dependsOn),
    );
  });

  it("adds one review per image without changing any existing step's fingerprint", () => {
    const on: RunConfig = {
      ...narrated,
      reviews: { ...reviewer, stages: { images: { mode: "flag" } } },
    };
    const before = fingerprints(narrated);
    const after = fingerprints(on);
    for (const [key, value] of Object.entries(before)) expect(after[key]).toBe(value);
    expect(
      Object.keys(after)
        .filter((key) => !(key in before))
        .sort(),
    ).toEqual(["review:image:harbor", "review:image:hill"]);
    const recipes = recipesFor(on);
    expect(recipes.find((row) => row.key === "review:image:harbor")).toMatchObject({
      stage: "images",
      kind: "provider",
      dependsOn: ["image:harbor"],
      input: { kind: "local", operation: "review-v1" },
    });
    // The render waits for both reviews before the run moves on.
    expect(recipes.find((row) => row.key === "export:video")?.dependsOn).toEqual(
      expect.arrayContaining(["review:image:harbor", "review:image:hill"]),
    );
    const review = recipes.find((row) => row.key === "review:image:hill");
    if (review === undefined) throw new Error("no review");
    expect(recipeProviderChoice(review, on)).toEqual({ ...reviewer, family: "llm" });
  });

  it("hears the narration through the word timing without making the timing wait for it", () => {
    const on: RunConfig = {
      ...narrated,
      reviews: { ...reviewer, stages: { narration: { mode: "redo" } } },
    };
    const recipes = recipesFor(on);
    const review = recipes.find((row) => row.key === "review:narration");
    expect(review?.dependsOn).toContain("subtitles:timing");
    expect(recipes.find((row) => row.key === "subtitles:timing")?.dependsOn).not.toContain(
      "review:narration",
    );
    expect(recipes.find((row) => row.key === "export:video")?.dependsOn).toContain(
      "review:narration",
    );
  });

  it("reviews again when the reviewer or its prompt changes, and leaves the item alone", () => {
    const on: RunConfig = {
      ...narrated,
      reviews: { ...reviewer, stages: { images: { mode: "flag" } } },
    };
    const a = fingerprints(on);
    const b = fingerprints({
      ...on,
      reviews: { ...reviewer, model: "other", stages: { images: { mode: "flag" } } },
    });
    expect(b["review:image:hill"]).not.toBe(a["review:image:hill"]);
    expect(b["image:hill"]).toBe(a["image:hill"]);
  });
});
