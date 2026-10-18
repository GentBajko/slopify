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

  it("reviews only each stage's first item in a template studio sample", () => {
    const on: RunConfig = {
      ...narrated,
      reviews: { ...reviewer, stages: { images: { mode: "flag" } } },
      sample: { fullScript: false },
    };
    const reviews = recipesFor(on).filter((row) => row.key.startsWith("review:"));
    expect(reviews.map((row) => row.key)).toEqual(["review:image:harbor"]);
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

  it("plans an agent's review as a local step that calls no provider", () => {
    const on: RunConfig = {
      ...narrated,
      reviews: { provider: "", model: "", reviewer: "agent", stages: { images: { mode: "redo" } } },
    };
    const recipes = recipesFor(on);
    const review = recipes.find((row) => row.key === "review:image:hill");
    expect(review).toMatchObject({
      stage: "images",
      kind: "local",
      dependsOn: ["image:hill"],
      input: { kind: "local", operation: "review-agent-v1" },
    });
    if (review === undefined) throw new Error("no review");
    expect(recipeProviderChoice(review, on)).toBeUndefined();
    expect(recipes.find((row) => row.key === "export:video")?.dependsOn).toEqual(
      expect.arrayContaining(["review:image:harbor", "review:image:hill"]),
    );
  });
});

describe("the promise check's recipe", () => {
  const written: RunConfig = {
    ...narrated,
    sources: { ...narrated.sources, article: "generate", thumbnail: "prompt_by_llm" },
    rendered: { ...narrated.rendered, thumbnailPrompt: "Draw the hook." },
  };
  const generatedRecipes = (c: RunConfig) =>
    buildRecipes({
      config: c,
      content: { ...content, articleMarkdown: undefined },
      manifest: { outputs: [], pieces: [] },
      resolved: { articleMarkdown: null, researchNotes: null },
    });

  it("changes no step at all while it is off", () => {
    const before = generatedRecipes(written);
    expect(
      generatedRecipes({
        ...written,
        reviews: { ...reviewer, stages: { promise: { mode: "off" } } },
      }),
    ).toEqual(before);
    expect(generatedRecipes({ ...written, reviews: { ...reviewer, stages: {} } })).toEqual(before);
  });

  it("reads the article and the thumbnail brief, and holds the narration until it answers", () => {
    const on: RunConfig = {
      ...written,
      reviews: { ...reviewer, stages: { promise: { mode: "redo" } } },
    };
    const before = generatedRecipes(written);
    const recipes = generatedRecipes(on);
    const review = recipes.find((row) => row.key === "review:promise");
    expect(review).toMatchObject({
      stage: "article",
      kind: "provider",
      dependsOn: ["article:body", "thumbnail:prompt"],
      input: { kind: "local", operation: "review-v1" },
    });
    const values = review?.input.kind === "local" ? review.input.values : null;
    expect(Array.isArray(values) ? values.slice(0, 2) : values).toEqual(["promise", "promise"]);
    for (const row of recipes) {
      const was = before.find((one) => one.key === row.key);
      if (was === undefined || row.key === "thumbnail:prompt") continue;
      if (was.dependsOn.includes("article:body")) expect(row.dependsOn).toContain("review:promise");
    }
    expect(recipes.find((row) => row.key === "thumbnail:prompt")?.dependsOn).not.toContain(
      "review:promise",
    );
    const audio = recipes.filter((row) => row.stage === "audio");
    expect(audio.length).toBeGreaterThan(0);
    expect(audio.some((row) => row.dependsOn.includes("review:promise"))).toBe(true);
  });

  it("reads only the article when the thumbnail brief isn't written by a model", () => {
    const on: RunConfig = {
      ...written,
      sources: { ...written.sources, thumbnail: "from_prompt" },
      reviews: { ...reviewer, stages: { promise: { mode: "flag" } } },
    };
    expect(generatedRecipes(on).find((row) => row.key === "review:promise")?.dependsOn).toEqual([
      "article:body",
    ]);
  });

  it("plans the promise check and the keyword digest together without a loop", () => {
    const acyclic = (rows: ReturnType<typeof generatedRecipes>) => {
      const byKey = new Map(rows.map((row) => [row.key, row]));
      const state = new Map<string, "open" | "done">();
      const visit = (key: string): boolean => {
        if (state.get(key) === "done") return true;
        if (state.get(key) === "open") return false;
        state.set(key, "open");
        const ok = (byKey.get(key)?.dependsOn ?? []).every(visit);
        state.set(key, "done");
        return ok;
      };
      return rows.every((row) => visit(row.key));
    };
    const plan = (c: RunConfig, templates: Readonly<Record<string, string>>) =>
      buildRecipes({
        config: c,
        content: {
          ...content,
          articleMarkdown: undefined,
          promptTemplates: { article: "Write.", ...templates },
        },
        manifest: { outputs: [], pieces: [] },
        resolved: { articleMarkdown: null, researchNotes: null },
      });
    const reviewed = (c: RunConfig): RunConfig => ({
      ...c,
      reviews: { ...reviewer, stages: { promise: { mode: "redo" } } },
    });
    const find = (rows: ReturnType<typeof generatedRecipes>, key: string) => {
      const row = rows.find((one) => one.key === key);
      if (row === undefined) throw new Error(`Missing ${key}`);
      return row;
    };

    // The thumbnail brief the check reads is written from the digest: the digest runs first,
    // straight after the article, and the brief after it.
    const briefed: RunConfig = { ...written, articlePrompt: "Article", thumbnailPrompt: "Thumb" };
    const fromBrief = plan(reviewed(briefed), {
      thumbnailPrompt: "Draw: {{Slopify_Thumbnail_Text}}",
    });
    expect(acyclic(fromBrief)).toBe(true);
    expect(find(fromBrief, "article:digest").dependsOn).toEqual(["article:body"]);
    expect(find(fromBrief, "thumbnail:prompt").dependsOn).toContain("article:digest");
    expect(find(fromBrief, "review:promise").dependsOn).toEqual([
      "article:body",
      "thumbnail:prompt",
    ]);

    // Only the description reads the digest: it reads the article like the narration, so it
    // waits for the check, and the description waits for both.
    const described: RunConfig = {
      ...written,
      sources: { ...written.sources, thumbnail: "off" },
      articlePrompt: "Article",
      youtubeDescription: true,
      descriptionPrompt: "Description",
    };
    const fromDescription = plan(reviewed(described), {
      description: "Open with: {{Slopify_Hook}}",
    });
    expect(acyclic(fromDescription)).toBe(true);
    expect(find(fromDescription, "review:promise").dependsOn).toEqual(["article:body"]);
    expect(find(fromDescription, "article:digest").dependsOn).toEqual([
      "article:body",
      "review:promise",
    ]);
    expect(find(fromDescription, "youtube:description").dependsOn).toContain("article:digest");
    const planned = planRevision(emptyView(reviewed(described)), {
      config: reviewed(described),
      content: {
        ...content,
        promptTemplates: { article: "Write.", description: "{{Slopify_Hook}}" },
      },
    });
    expect(planned.ok).toBe(true);
  });

  it("adds no step for an article the person wrote", () => {
    const provided: RunConfig = {
      ...narrated,
      reviews: { ...reviewer, stages: { promise: { mode: "redo" } } },
    };
    expect(recipesFor(provided)).toEqual(recipesFor(narrated));
  });
});
