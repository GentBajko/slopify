import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import type { ShortPick } from "../shorts/pick.js";
import { buildRecipes } from "./recipe-build.js";
import { config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import { type ResolvedWorkRecipe, recipe, resourceIdentity } from "./recipe-model.js";
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

describe("Shorts recipes, clip by clip", () => {
  // The recipes once a pick saved `payload` and each clip's prompts answered.
  function planned(
    c: RunConfig,
    value: RevisionContent,
    payload: (pickFingerprint: string) => unknown,
  ): readonly ResolvedWorkRecipe[] {
    const pick = key(recipesFor(c, [], value), "shorts:pick");
    const picked = [piece("shorts:pick", pick.fingerprint, payload(pick.fingerprint))];
    const second = recipesFor(c, picked, value);
    const written = second
      .filter((row) => row.key.endsWith(":prompts"))
      .map((row) => {
        if (row.input.kind !== "llm") throw new Error("Expected an LLM request");
        const count = Number(
          /Exactly (\d+) prompt/.exec(row.input.messages[0]?.content ?? "")?.[1],
        );
        return piece(row.key, row.fingerprint, {
          prompts: Array.from(
            { length: count },
            (_value, at) => `${row.key} image ${String(at + 1)}`,
          ),
        });
      });
    return recipesFor(c, [...picked, ...written], value);
  }
  const fingerprints = (recipes: readonly ResolvedWorkRecipe[], prefix: string) =>
    Object.fromEntries(
      recipes.filter((row) => row.key.startsWith(prefix)).map((row) => [row.key, row.fingerprint]),
    );
  const sentences = Array.from({ length: 12 }, (_value, at) => ({
    start: at * 10,
    end: at * 10 + 9.5,
    text: `Sentence ${String(at + 1)}.`,
  }));
  const seeded = (number: number, first: number, last: number, seed: string | null) => ({
    ...clip(number, (first - 1) * 10 - 0.25, (last - 1) * 10 + 9.75),
    first,
    last,
    seed,
  });

  it("plans a short saved before these settings exactly as it did", () => {
    const recipes = unfolded().third;
    const timing = key(recipes, "subtitles:timing");
    const context = {
      config: shorts,
      content,
      manifest: { outputs: [], pieces: [] },
      resolved: { articleMarkdown: null, researchNotes: null },
    };
    const stills = [key(recipes, "shorts:1:image:1"), key(recipes, "shorts:1:image:2")];
    // The render's request as it was written before the title, speed and music: no fourth
    // group of values, and the pick's own regeneration token.
    const before = recipe(
      context,
      "shorts:1:render",
      "video",
      {
        kind: "local",
        version: 1,
        operation: "short-render-v1",
        values: [
          resourceIdentity(context, timing),
          1,
          10,
          45,
          stills.map((still) => resourceIdentity(context, still)),
          shorts.imageSeconds,
          shorts.zoomPercent,
          shorts.motionStyle,
          "default",
        ],
      },
      ["shorts:pick", ...stills.map((still) => still.key)],
      { tokenKey: "shorts:pick" },
    );
    expect(key(recipes, "shorts:1:render").fingerprint).toBe(before.fingerprint);
    const prompts = key(recipes, "shorts:1:prompts");
    expect(
      recipe(context, prompts.key, prompts.stage, prompts.input, prompts.dependsOn, {
        tokenKey: "shorts:pick",
      }).fingerprint,
    ).toBe(prompts.fingerprint);
  });

  it("renders again, and only renders, for the title, the speed and the music", () => {
    const base = unfolded().third;
    for (const next of [
      { ...shorts, shorts: { ...shorts.shorts, titleOnScreen: true } } as RunConfig,
      { ...shorts, shorts: { ...shorts.shorts, speed: 1.1 } } as RunConfig,
    ]) {
      const after = unfolded(next).third;
      expect(key(after, "shorts:1:render").fingerprint).not.toBe(
        key(base, "shorts:1:render").fingerprint,
      );
      expect(fingerprints(after, "shorts:1:image")).toEqual(fingerprints(base, "shorts:1:image"));
      expect(key(after, "shorts:pick").fingerprint).toBe(key(base, "shorts:pick").fingerprint);
    }
    // The title off, speed 1 and no music are the settings absent.
    expect(
      key(
        unfolded({
          ...shorts,
          shorts: { ...shorts.shorts, titleOnScreen: false, speed: 1, musicVolume: 40 },
        } as RunConfig).third,
        "shorts:1:render",
      ).fingerprint,
    ).toBe(key(base, "shorts:1:render").fingerprint);
    const music = unfolded(shorts, { ...content, shortsMusic: "music1" }).third;
    expect(key(music, "shorts:2:render").fingerprint).not.toBe(
      key(base, "shorts:2:render").fingerprint,
    );
    expect(key(music, "shorts:2:prompts").fingerprint).toBe(
      key(base, "shorts:2:prompts").fingerprint,
    );
  });

  it("makes one short again, and only that short", () => {
    const payload = () => ({
      shorts: [seeded(1, 2, 5, null), seeded(2, 7, 10, null)],
      durationSeconds: 120,
      sentences,
    });
    const base = planned(shorts, content, payload);
    const again = planned(
      shorts,
      { ...content, regenerationTokens: { "shorts:2": "again" } },
      payload,
    );
    expect(key(again, "shorts:pick").fingerprint).toBe(key(base, "shorts:pick").fingerprint);
    expect(fingerprints(again, "shorts:1:")).toEqual(fingerprints(base, "shorts:1:"));
    for (const name of ["shorts:2:prompts", "shorts:2:image:1", "shorts:2:render"])
      expect(key(again, name).fingerprint).not.toBe(key(base, name).fingerprint);
  });

  it("keeps a clip's work when the moments are picked again and its sentences are the same", () => {
    const base = planned(shorts, content, () => ({
      shorts: [seeded(1, 2, 5, null), seeded(2, 7, 10, null)],
      durationSeconds: 120,
      sentences,
    }));
    // The pick made again kept short 2 (same sentences, its old token) and made a new short 1.
    const repicked = planned(
      shorts,
      { ...content, regenerationTokens: { "shorts:pick": "again" } },
      () => ({
        shorts: [seeded(1, 3, 5, "again"), seeded(2, 7, 10, null)],
        durationSeconds: 120,
        sentences,
      }),
    );
    expect(key(repicked, "shorts:pick").fingerprint).not.toBe(key(base, "shorts:pick").fingerprint);
    expect(fingerprints(repicked, "shorts:2:")).toEqual(fingerprints(base, "shorts:2:"));
    expect(key(repicked, "shorts:1:prompts").fingerprint).not.toBe(
      key(base, "shorts:1:prompts").fingerprint,
    );
    // Even a new clip on the old sentences is new work when it carries the new token.
    const fresh = planned(
      shorts,
      { ...content, regenerationTokens: { "shorts:pick": "again" } },
      () => ({
        shorts: [seeded(1, 2, 5, "again"), seeded(2, 7, 10, null)],
        durationSeconds: 120,
        sentences,
      }),
    );
    expect(key(fresh, "shorts:1:render").fingerprint).not.toBe(
      key(base, "shorts:1:render").fingerprint,
    );
  });

  it("uses a range set by hand in place of the model's clip, and redoes only that clip", () => {
    const payload = () => ({
      shorts: [seeded(1, 2, 5, null), seeded(2, 7, 10, null)],
      durationSeconds: 120,
      sentences,
    });
    const base = planned(shorts, content, payload);
    const pick = key(base, "shorts:pick").fingerprint;
    const moved = planned(
      shorts,
      { ...content, shortsRanges: { "2": { first: 8, last: 11, pick } } },
      payload,
    );
    expect(fingerprints(moved, "shorts:1:")).toEqual(fingerprints(base, "shorts:1:"));
    const prompts = key(moved, "shorts:2:prompts");
    if (prompts.input.kind !== "llm") throw new Error("Expected an LLM request");
    expect(prompts.input.messages[1]?.content).toContain(
      "Sentence 8. Sentence 9. Sentence 10. Sentence 11.",
    );
    expect(key(moved, "shorts:2:render").input).toMatchObject({
      values: expect.arrayContaining([2, 69.75, 109.75]),
    });
    // Saving it is refused in plain words when it breaks the length rules.
    const view = {
      ...emptyView(shorts),
      pieces: [
        {
          ...piece("shorts:pick", pick, payload()),
          recordId: "pick-record",
          publicationId: null,
          selected: true,
          available: true,
        },
      ],
    };
    const refused = planRevision(view, {
      config: shorts,
      content: { ...content, shortsRanges: { "2": { first: 8, last: 8, pick } } },
    });
    expect(refused).toEqual({
      ok: false,
      fields: [
        {
          field: "content.shortsRanges.2",
          message:
            "Short 2 would last 10 seconds, shorter than the 30-second minimum. Start it earlier or end it later.",
        },
      ],
    });
    // One left from an earlier pick no longer applies and is not checked.
    expect(
      planRevision(view, {
        config: shorts,
        content: { ...content, shortsRanges: { "2": { first: 8, last: 8, pick: "older" } } },
      }).ok,
    ).toBe(true);
  });

  it("prices a short's images with its prompts, once the clips are picked", () => {
    const { second } = unfolded();
    const prompts = key(second, "shorts:2:prompts");
    const generate = {
      disposition: "generate" as const,
      inflight: false,
      pieceIds: [],
      reason: "Inputs changed or a required output is missing.",
    };
    // 40 s of clip at 20 s per image: the call and two images.
    const priced = priceRecipes({ ...prompts, ...generate }, prompts);
    expect(priced.map((row) => row.kind)).toEqual(["llm", "image", "image"]);
    expect(priced[1]).toMatchObject({ provider: "fal", model: "image-model" });
    expect(priceRecipes({ ...prompts, ...generate, disposition: "reuse" }, prompts)).toEqual([
      expect.objectContaining({ kind: "local" }),
    ]);
  });
});
