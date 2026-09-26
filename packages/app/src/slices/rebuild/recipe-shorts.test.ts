import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import type { ShortPick } from "../shorts/pick.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { priceRecipes } from "./recipe-work.js";
import { planRevision } from "./recipes.js";

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  imageSeconds: 20,
};
const shorts: RunConfig = {
  ...narrated,
  shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60 },
};

function recipesFor(
  c: RunConfig,
  pieces: readonly ManifestPiece[] = [],
  value: RevisionContent = content,
): readonly ResolvedWorkRecipe[] {
  const view = emptyView(c, value);
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces },
    resolved: { articleMarkdown: view.articleMarkdown, researchNotes: null },
  });
}

function piece(key: string, fingerprint: string, payload: unknown): ManifestPiece {
  return {
    key,
    stageKind: "video",
    assetId: null,
    fingerprint,
    piece: {
      id: `piece-${key}`,
      stageId: "video",
      kind: "article_written",
      idx: 1,
      state: "done",
      payload: JSON.stringify(payload),
    },
  };
}

const clip = (number: number, start: number, end: number): ShortPick => ({
  number,
  first: number * 10,
  last: number * 10 + 5,
  start,
  end,
  title: `Short ${String(number)}`,
  description: "One line.",
  hashtags: ["#One", "#Two", "#Three"],
  why: "It stands alone.",
  text: `What short ${String(number)} says.`,
});

function key(recipes: readonly ResolvedWorkRecipe[], name: string): ResolvedWorkRecipe {
  const found = recipes.find((row) => row.key === name);
  if (found === undefined) throw new Error(`Missing ${name}`);
  return found;
}

// The recipes once the pick has answered, and once each clip's prompts have too.
function unfolded(c: RunConfig = shorts, value: RevisionContent = content) {
  const first = recipesFor(c, [], value);
  const pick = key(first, "shorts:pick");
  const picked = [
    piece("shorts:pick", pick.fingerprint, { shorts: [clip(1, 10, 45), clip(2, 60, 100)] }),
  ];
  const second = recipesFor(c, picked, value);
  const written = [
    ...picked,
    piece("shorts:1:prompts", key(second, "shorts:1:prompts").fingerprint, {
      prompts: ["A harbor at dawn", "Boats leaving"],
    }),
    piece("shorts:2:prompts", key(second, "shorts:2:prompts").fingerprint, {
      prompts: ["A hill", "A tower"],
    }),
  ];
  return { first, second, third: recipesFor(c, written, value) };
}

function changed(before: RunConfig, after: RunConfig, next = content): readonly string[] {
  const base = emptyView(before);
  const a = planRevision(base, { config: before, content });
  const b = planRevision(base, { config: after, content: next });
  if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
  const keys = new Set([...Object.keys(a.fingerprints), ...Object.keys(b.fingerprints)]);
  return [...keys].filter((one) => a.fingerprints[one] !== b.fingerprints[one]).sort();
}

describe("Shorts recipes", () => {
  it("picks after the word timing, in the Video stage, beside the render, with the rest deferred", () => {
    const recipes = recipesFor(shorts);
    expect(key(recipes, "shorts:pick")).toMatchObject({
      stage: "video",
      kind: "provider",
      dependsOn: ["subtitles:timing"],
      input: { kind: "local", operation: "shorts-pick-v1" },
    });
    expect(key(recipes, "shorts:future")).toMatchObject({
      stage: "video",
      deferred: true,
      dependsOn: ["shorts:pick"],
      input: { kind: "deferred", operation: "shorts" },
    });
    expect(key(recipes, "export:video").dependsOn).not.toContain("shorts:pick");
    // The timing runs for the shorts with captions off, and makes no caption files.
    const keys = recipes.map((row) => row.key);
    expect(keys).toContain("subtitles:timing");
    expect(keys).not.toContain("subtitles:files");
  });

  it("is not planned when off, on a config saved before it existed, or without narration", () => {
    for (const c of [
      narrated,
      { ...narrated, shorts: { ...shorts.shorts, enabled: false } } as RunConfig,
      { ...config, shorts: shorts.shorts } as RunConfig,
    ]) {
      const keys = recipesFor(c).map((row) => row.key);
      expect(keys.filter((one) => one.startsWith("shorts:"))).toEqual([]);
      expect(keys).not.toContain("subtitles:timing");
    }
  });

  it("leaves every fingerprint of an existing project as it was", () => {
    // A config saved before Shorts has no key at all; off keeps the settings but plans the
    // same work.
    const before = recipesFor(narrated);
    const off = recipesFor({
      ...narrated,
      shorts: { ...shorts.shorts, enabled: false },
    } as RunConfig);
    expect(off.map((row) => [row.key, row.fingerprint])).toEqual(
      before.map((row) => [row.key, row.fingerprint]),
    );
    const base = emptyView(narrated);
    const a = planRevision(base, { config: narrated, content });
    const b = planRevision(base, {
      config: { ...narrated, shorts: { ...shorts.shorts, enabled: false } } as RunConfig,
      content,
    });
    if (!a.ok || !b.ok) throw new Error("Expected plans");
    expect(b.fingerprints).toEqual(a.fingerprints);
  });

  it("unfolds into each clip's prompts once the pick's answer matches, and its images and render once those do", () => {
    const { second, third } = unfolded();
    expect(second.map((row) => row.key).filter((one) => one.startsWith("shorts:"))).toEqual([
      "shorts:pick",
      "shorts:1:prompts",
      "shorts:2:prompts",
    ]);
    const prompts = key(second, "shorts:1:prompts");
    expect(prompts).toMatchObject({ stage: "video", kind: "provider", dependsOn: ["shorts:pick"] });
    if (prompts.input.kind !== "llm") throw new Error("Expected an LLM request");
    // 35 s of clip at 20 s per image: two images.
    expect(prompts.input.messages[0]?.content).toContain("Exactly 2 prompts");
    expect(prompts.input.messages[1]?.content).toContain("What short 1 says.");
    expect(third.map((row) => row.key).filter((one) => one.startsWith("shorts:"))).toEqual([
      "shorts:pick",
      "shorts:1:prompts",
      "shorts:1:image:1",
      "shorts:1:image:2",
      "shorts:1:render",
      "shorts:2:prompts",
      "shorts:2:image:1",
      "shorts:2:image:2",
      "shorts:2:render",
    ]);
    expect(key(third, "shorts:1:image:2")).toMatchObject({
      stage: "video",
      kind: "provider",
      dependsOn: ["shorts:1:prompts"],
      input: {
        kind: "image",
        provider: "fal",
        model: "image-model",
        prompt: "Boats leaving",
        aspect: "9:16",
      },
    });
    expect(key(third, "shorts:2:render")).toMatchObject({
      kind: "local",
      dependsOn: ["shorts:pick", "shorts:2:image:1", "shorts:2:image:2"],
      input: { kind: "local", operation: "short-render-v1" },
    });
  });

  it("ignores a saved pick that answered other settings", () => {
    const pick = key(recipesFor(shorts), "shorts:pick");
    const stale = [piece("shorts:pick", `${pick.fingerprint}-old`, { shorts: [clip(1, 10, 45)] })];
    expect(recipesFor(shorts, stale).map((row) => row.key)).toContain("shorts:future");
  });

  it("makes the whole chain again when asked to regenerate the shorts", () => {
    const { third } = unfolded();
    const again = { ...content, regenerationTokens: { "shorts:pick": "again" } };
    const first = recipesFor(shorts, [], again);
    expect(key(first, "shorts:pick").fingerprint).not.toBe(key(third, "shorts:pick").fingerprint);
    // Even a pick that lands on the same clips writes new prompts, images and renders.
    const pick = key(first, "shorts:pick");
    const picked = [piece("shorts:pick", pick.fingerprint, { shorts: [clip(1, 10, 45)] })];
    const replanned = recipesFor(shorts, picked, again);
    expect(key(replanned, "shorts:1:prompts").fingerprint).not.toBe(
      key(third, "shorts:1:prompts").fingerprint,
    );
    expect(changed(shorts, shorts, again).filter((one) => !one.startsWith("shorts:"))).toEqual([]);
  });

  it("goes stale with its settings and model, and not with captions' look", () => {
    const edited = (next: Partial<NonNullable<RunConfig["shorts"]>>): RunConfig => ({
      ...shorts,
      shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60, ...next },
    });
    for (const next of [
      edited({ count: 3 }),
      edited({ minSeconds: 20 }),
      edited({ maxSeconds: 90 }),
      { ...shorts, llm: { provider: "text", model: "other" } },
      { ...shorts, title: "Renamed" },
    ])
      expect(changed(shorts, next)).toContain("shorts:pick");
    expect(
      changed(shorts, {
        ...shorts,
        subtitles: {
          mode: "files",
          language: "en",
          fontId: "default",
          fontSize: 60,
          position: "top",
        },
      }),
    ).not.toContain("shorts:pick");
  });

  it("switching it on leaves the article, images and video retained", () => {
    const plan = workFor(readyView(narrated), shorts);
    expect(
      plan.work
        .filter((row) => row.disposition !== "reuse" && row.key.startsWith("shorts:"))
        .map((row) => row.key)
        .sort(),
    ).toEqual(["shorts:future", "shorts:pick"]);
    expect(plan.work.find((row) => row.key === "export:video")?.disposition).toBe("reuse");
  });

  it("asks the text model to pick and prices the images at the most the step can ask for", () => {
    const recipes = recipesFor(shorts);
    const pick = key(recipes, "shorts:pick");
    const future = key(recipes, "shorts:future");
    expect(recipeProviderChoice(pick, shorts)).toEqual({
      provider: "text",
      model: "text-model",
      family: "llm",
    });
    expect(recipeProviderChoice(future, shorts)).toEqual({
      provider: "fal",
      model: "image-model",
      family: "image",
    });
    const generate = {
      disposition: "generate" as const,
      inflight: false,
      pieceIds: [],
      reason: "Inputs changed or a required output is missing.",
    };
    expect(priceRecipes({ ...pick, ...generate }, pick)).toEqual([
      expect.objectContaining({ kind: "llm", provider: "text", model: "text-model" }),
    ]);
    // Two shorts of at most 60 s at 20 s per image: three images each, and one prompt call
    // per short.
    const priced = priceRecipes({ ...future, ...generate }, future);
    expect(priced.filter((row) => row.kind === "image")).toHaveLength(6);
    expect(priced.filter((row) => row.kind === "llm")).toHaveLength(2);
    expect(priced.find((row) => row.kind === "image")).toMatchObject({
      provider: "fal",
      model: "image-model",
    });
    expect(priceRecipes({ ...future, ...generate, disposition: "reuse" }, future)).toEqual([
      expect.objectContaining({ kind: "local" }),
    ]);
  });

  it("refuses bad settings on save in the shared rule's words", () => {
    const base = emptyView(shorts);
    const refused = (c: RunConfig) => {
      const plan = planRevision(base, { config: c, content });
      return plan.ok ? [] : plan.fields.map((one) => one.field);
    };
    expect(refused(shorts)).toEqual([]);
    expect(
      refused({ ...shorts, shorts: { ...shorts.shorts, count: 0 } as RunConfig["shorts"] }),
    ).toEqual(["shorts.count"]);
    expect(refused({ ...shorts, sources: { ...shorts.sources, audio: "off" } })).toContain(
      "shorts.enabled",
    );
    expect(refused({ ...shorts, images: undefined })).toContain("images");
    expect(refused({ ...shorts, llm: undefined })).toContain("llm");
  });
});
