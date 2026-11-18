import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestOutput, ManifestPiece, RevisionContent } from "../revisions/model.js";
import { pickedShortsOf } from "../shorts/clips.js";
import type { ShortPick } from "../shorts/pick.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import { type ResolvedWorkRecipe, recipe, resourceIdentity } from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { savedPicked } from "./recipe-shorts.js";
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

// The pick as it was asked before shorts were cut on the body's clock: of the whole timing.
function legacyPick(recipes: readonly ResolvedWorkRecipe[], value: RevisionContent = content) {
  const pick = key(recipes, "shorts:pick");
  const timing = key(recipes, "subtitles:timing");
  if (pick.input.kind !== "local" || !Array.isArray(pick.input.values))
    throw new Error("Expected a local pick");
  const [, ...rest] = pick.input.values;
  const context = {
    content: value,
    manifest: { outputs: [], pieces: [] },
  } as unknown as Parameters<typeof resourceIdentity>[0];
  return recipe(
    context,
    pick.key,
    pick.stage,
    { ...pick.input, values: [resourceIdentity(context, timing), ...rest] },
    pick.dependsOn,
    { kind: "provider" },
  );
}

// The recipes once the pick has answered, and once each clip's prompts have too. `legacy`
// saves the pick as one made before shorts were cut on the body's clock.
function unfolded(c: RunConfig = shorts, value: RevisionContent = content, legacy = false) {
  const first = recipesFor(c, [], value);
  const pick = legacy ? legacyPick(first, value) : key(first, "shorts:pick");
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
    const recipes = unfolded(shorts, content, true).third;
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

describe("a shorts image prompt with the keywords Slopify fills", () => {
  const styled: RunConfig = {
    ...shorts,
    shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60, imagePrompt: "Shorts" },
    rendered: {
      ...shorts.rendered,
      shortsImage: "An engraving.\n\nScene: {{Scene}}\n\nLooks: {{Appearance}}",
    },
  };
  const looks = {
    subject: { name: "The Keeper", aliases: [], look: "A tall man in a grey coat." },
    characters: [{ name: "short 1", aliases: [], look: "A figure in red." }],
  };

  it("looks up the looks, waits for them, then gives each short the subject's and its own", () => {
    const first = recipesFor(styled);
    const lookup = key(first, "images:appearance");
    const pick = key(first, "shorts:pick");
    const picked = [
      piece("shorts:pick", pick.fingerprint, { shorts: [clip(1, 10, 45), clip(2, 60, 100)] }),
    ];
    const waiting = key(recipesFor(styled, picked), "shorts:1:prompts");
    expect(waiting.input.kind).toBe("deferred");
    expect(waiting.dependsOn).toContain("images:appearance");
    const looked = recipesFor(styled, [
      ...picked,
      {
        ...piece("images:appearance", lookup.fingerprint, { appearance: looks }),
        stageKind: "images",
      },
    ]);
    const request = key(looked, "shorts:1:prompts").input;
    const said = request.kind === "llm" ? (request.messages.at(-1)?.content ?? "") : "";
    // The scene line is the prompts call's own job; the looks are filled in.
    expect(said).not.toContain("{{Scene}}");
    expect(said).not.toContain("Scene:");
    expect(said).toContain(
      "Looks: The Keeper: A tall man in a grey coat.\nshort 1: A figure in red.",
    );
  });
});

describe("the saved pick of a project from an older fingerprint scheme", () => {
  it("is the selected pick when only its output carries the plan's fingerprint", () => {
    const payload = JSON.stringify({ shorts: [] });
    const pick = { key: "shorts:pick", fingerprint: "logical-fp" } as unknown as Parameters<
      typeof savedPicked
    >[1];
    const context = {
      manifest: {
        outputs: [
          { workKey: "shorts:pick", fingerprint: "logical-fp", assetId: "a1", state: "ready" },
        ],
        pieces: [
          {
            key: "shorts:pick",
            fingerprint: "full-fp",
            assetId: null,
            piece: { state: "done", payload },
          },
        ],
      },
    } as unknown as Parameters<typeof savedPicked>[0];
    expect(savedPicked(context, pick)).toEqual(pickedShortsOf(payload));
    expect(savedPicked(context, pick)).not.toBeUndefined();
  });
});

describe("the saved pick of an older project while its run is planned", () => {
  it("is the selected pick when its output carries the pick asked of the recorded timing", () => {
    // A run's plan reads the catalogue, so the pick's fingerprint is not the one the version
    // was saved with; the same pick asked of the finished timing as recorded is.
    const payload = JSON.stringify({ shorts: [] });
    const pick = { key: "shorts:pick", fingerprint: "catalogue-fp" } as unknown as Parameters<
      typeof savedPicked
    >[1];
    const context = {
      manifest: {
        outputs: [
          { workKey: "shorts:pick", fingerprint: "logical-fp", assetId: "a1", state: "ready" },
        ],
        pieces: [
          {
            key: "shorts:pick",
            fingerprint: "full-fp",
            assetId: null,
            piece: { state: "done", payload },
          },
        ],
      },
    } as unknown as Parameters<typeof savedPicked>[0];
    expect(savedPicked(context, pick)).toBeUndefined();
    expect(savedPicked(context, pick, ["logical-fp"])).not.toBeUndefined();
  });
});

describe("shorts cut on the body's clock", () => {
  // A narrated video with a spoken intro and outro, as a channel template sets them.
  const framed = (intro: string, outro: string, more: Partial<RunConfig> = {}): RunConfig =>
    ({
      ...shorts,
      intro: { name: "Intro", mode: "text" },
      outro: { name: "Outro", mode: "text" },
      rendered: { ...shorts.rendered, intro, outro },
      ...more,
    }) as RunConfig;
  const before = framed("Welcome to the channel.", "Thanks for listening.");
  const newIntro = framed("Welcome back. Find the book on the website.", "Thanks for listening.");
  const newOutro = framed("Welcome to the channel.", "Support the channel on the website.");
  const loudness = { loudness: { videoLufs: -14, audioFilesLufs: -18 } } as Partial<RunConfig>;

  // Every shorts step planned for `after` from the work saved under `saved`'s plan.
  function shortsAfter(saved: RunConfig, after: RunConfig, legacy = false) {
    const { first, third } = unfolded(saved, content, legacy);
    const pieces = [
      piece("shorts:pick", (legacy ? legacyPick(first) : key(first, "shorts:pick")).fingerprint, {
        shorts: [clip(1, 10, 45), clip(2, 60, 100)],
      }),
      ...["shorts:1:prompts", "shorts:2:prompts"].map((name, at) =>
        piece(name, key(third, name).fingerprint, {
          prompts: at === 0 ? ["A harbor at dawn", "Boats leaving"] : ["A hill", "A tower"],
        }),
      ),
    ];
    const shortsOf = (recipes: readonly ResolvedWorkRecipe[]) =>
      Object.fromEntries(
        recipes
          .filter((row) => row.key.startsWith("shorts:"))
          .map((row) => [row.key, row.fingerprint]),
      );
    const was = recipesFor(saved, pieces);
    const now = recipesFor(after, pieces);
    return {
      was: shortsOf(was),
      now: shortsOf(now),
      timing: [key(was, "subtitles:timing").fingerprint, key(now, "subtitles:timing").fingerprint],
    };
  }

  for (const [name, after] of [
    ["intro", newIntro],
    ["outro", newOutro],
  ] as const)
    it(`keeps the pick and every short as they are when only the ${name} changes`, () => {
      const { was, now, timing } = shortsAfter(before, after);
      // The new words move every word of the video's timing...
      expect(timing[1]).not.toBe(timing[0]);
      // ...and not one shorts step: the pick, each clip's prompts, images and render.
      expect(Object.keys(now)).toEqual([
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
      expect(now).toEqual(was);
    });

  it("keeps every short with the volume levelled, whose master reads the body alone", () => {
    const { was, now } = shortsAfter(
      framed("Welcome to the channel.", "Thanks for listening.", loudness),
      framed("Welcome back. Find the book on the website.", "Thanks for listening.", loudness),
    );
    expect(now["shorts:1:render"]).toBeDefined();
    expect(now).toEqual(was);
  });

  it("picks again when the body's narration changes", () => {
    const edited = { ...content, articleMarkdown: "First paragraph.\n\nA new second paragraph." };
    const a = key(recipesFor(before), "shorts:pick");
    const b = key(
      recipesFor({ ...before, provided: { article: edited.articleMarkdown } }, [], edited),
      "shorts:pick",
    );
    expect(b.fingerprint).not.toBe(a.fingerprint);
  });

  it("reads the body's timing, with no intro, outro or silence in it", () => {
    const pick = key(recipesFor(before), "shorts:pick");
    if (pick.input.kind !== "local" || !Array.isArray(pick.input.values))
      throw new Error("Expected a local pick");
    const timing = pick.input.values[0];
    expect(Array.isArray(timing) && timing[0]).toBe("body-clock-v1");
    expect(JSON.stringify(timing)).not.toContain("Welcome");
    // The silence around the intro and outro moves the body, not its words.
    expect(
      key(recipesFor({ ...before, silenceGapSeconds: 2, edgeSilenceSeconds: 1 }), "shorts:pick")
        .fingerprint,
    ).toBe(pick.fingerprint);
  });

  it("is the same pick in a run's plan, which reads the catalogue, once the body is made", () => {
    // The catalogue's character limit can split the narration's requests another way, so the
    // body's recipe has another fingerprint there; its file is the same.
    const plan = (withCatalogue: boolean) =>
      buildRecipes({
        config: before,
        content,
        manifest: {
          outputs: [
            {
              slot: "audio:body:concat",
              workKey: "audio:body:concat",
              assetId: "body-file",
              fingerprint: "made-before",
              state: "ready",
              output: { durationMs: 100_000 },
            } as unknown as ManifestOutput,
          ],
          pieces: [],
        },
        resolved: { articleMarkdown: content.articleMarkdown ?? null, researchNotes: null },
        ...(withCatalogue ? { catalogue } : {}),
      });
    expect(key(plan(true), "shorts:pick").fingerprint).toBe(
      key(plan(false), "shorts:pick").fingerprint,
    );
  });

  it("keeps a pick made on the video's clock while its timing holds, then moves to the body's", () => {
    // Saved before this change: nothing about it is outdated while the timing is the same.
    const same = shortsAfter(before, before, true);
    expect(same.now).toEqual(same.was);
    // A new intro moves the timing it was asked of: the pick is made again once, on the
    // body's clock, and is left alone by every intro after that.
    const moved = shortsAfter(before, newIntro, true);
    expect(moved.now["shorts:pick"]).not.toBe(moved.was["shorts:pick"]);
    expect(moved.now["shorts:pick"]).toBe(key(recipesFor(newIntro), "shorts:pick").fingerprint);
    expect(key(recipesFor(newIntro), "shorts:pick").fingerprint).toBe(
      key(recipesFor(before), "shorts:pick").fingerprint,
    );
  });
});

describe("a short cut from its own chunks of the narration", () => {
  // Three paragraphs, each voiced as its own chunk; short 1 is the first, short 2 the third.
  const paragraphs = ["Alpha one. Alpha two.", "Beta one. Beta two.", "Gamma one. Gamma two."];
  const chunked: RunConfig = {
    ...shorts,
    chunking: { mode: "paragraph" },
    intro: { name: "Intro", mode: "text" },
    rendered: { ...shorts.rendered, intro: "Welcome to the channel." },
  } as RunConfig;
  const article = (texts: readonly string[]) => texts.join("\n\n");
  const contentOf = (texts: readonly string[]): RevisionContent => ({
    ...content,
    articleMarkdown: article(texts),
  });
  const configOf = (texts: readonly string[]): RunConfig => ({
    ...chunked,
    provided: { article: article(texts) },
  });
  const said = (number: number, at: number, text: string): ShortPick => ({
    ...clip(number, at * 10, at * 10 + 40),
    first: at * 2 + 1,
    last: at * 2 + 2,
    text,
    seed: `seed-${String(number)}`,
  });
  // Each body chunk voiced: its request done with the words it said and a file.
  function voiced(recipes: readonly ResolvedWorkRecipe[], files: Record<string, string>) {
    return recipes.flatMap((row) =>
      row.input.kind === "tts" && row.input.segment === "body"
        ? [
            {
              ...piece(row.key, row.fingerprint, { text: row.input.text }),
              assetId: files[row.input.text] ?? `file-${row.input.text}`,
            },
          ]
        : [],
    );
  }
  // The shorts planned for an article once its chunks are voiced, its pick has answered with
  // `clips` and each clip's prompts are written.
  function shortsFor(
    texts: readonly string[],
    clips: readonly ShortPick[],
    value: RevisionContent = contentOf(texts),
    files: Record<string, string> = {},
  ) {
    const c = configOf(texts);
    const audio = voiced(recipesFor(c, [], value), files);
    const pick = key(recipesFor(c, audio, value), "shorts:pick");
    const picked = [...audio, piece("shorts:pick", pick.fingerprint, { shorts: clips })];
    const second = recipesFor(c, picked, value);
    const written = second
      .filter((row) => row.key.endsWith(":prompts"))
      .map((row) => piece(row.key, row.fingerprint, { prompts: ["One", "Two"] }));
    return Object.fromEntries(
      recipesFor(c, [...picked, ...written], value)
        .filter((row) => row.key.startsWith("shorts:"))
        .map((row) => [row.key, row.fingerprint]),
    );
  }
  const own = (all: Record<string, string>, number: number) =>
    Object.fromEntries(
      Object.entries(all).filter(([name]) => name.startsWith(`shorts:${String(number)}:`)),
    );
  const before = shortsFor(paragraphs, [
    said(1, 0, "Alpha one. Alpha two."),
    said(2, 2, "Gamma one. Gamma two."),
  ]);

  it("keeps a short whose chunk is unchanged when another chunk is rewritten", () => {
    const rewritten = [
      paragraphs[0] ?? "",
      "Beta, said anew. And longer now.",
      paragraphs[2] ?? "",
    ];
    const after = shortsFor(rewritten, [
      said(1, 0, "Alpha one. Alpha two."),
      // Its sentences moved: the chunk before it says more now.
      { ...said(2, 2, "Gamma one. Gamma two."), first: 5, last: 6, start: 25, end: 65 },
    ]);
    expect(Object.keys(own(after, 1))).toContain("shorts:1:render");
    expect(own(after, 1)).toEqual(own(before, 1));
    expect(own(after, 2)).toEqual(own(before, 2));
  });

  it("keeps a short when words are added before it", () => {
    const added = ["Zero one. Zero two.", ...paragraphs];
    const after = shortsFor(added, [
      { ...said(1, 1, "Alpha one. Alpha two."), first: 3, last: 4 },
      { ...said(2, 3, "Gamma one. Gamma two."), first: 7, last: 8 },
    ]);
    expect(own(after, 1)).toEqual(own(before, 1));
    expect(own(after, 2)).toEqual(own(before, 2));
  });

  it("renders again only the short whose own chunk is voiced again", () => {
    const after = shortsFor(
      paragraphs,
      [said(1, 0, "Alpha one. Alpha two."), said(2, 2, "Gamma one. Gamma two.")],
      contentOf(paragraphs),
      { "Gamma one. Gamma two.": "gamma-voiced-again" },
    );
    expect(own(after, 1)).toEqual(own(before, 1));
    expect(after["shorts:2:render"]).not.toBe(before["shorts:2:render"]);
    // Same words: its prompts and images stay.
    expect(after["shorts:2:image:1"]).toBe(before["shorts:2:image:1"]);
  });

  it("makes again only the short whose own words changed", () => {
    const edited = ["Alpha one. Alpha, now two.", paragraphs[1] ?? "", paragraphs[2] ?? ""];
    const after = shortsFor(edited, [
      { ...said(1, 0, "Alpha one. Alpha, now two."), seed: "token" },
      said(2, 2, "Gamma one. Gamma two."),
    ]);
    expect(after["shorts:1:prompts"]).not.toBe(before["shorts:1:prompts"]);
    expect(after["shorts:1:render"]).not.toBe(before["shorts:1:render"]);
    expect(own(after, 2)).toEqual(own(before, 2));
  });

  it("picks again, once, when the body's words change, so kept shorts are found again", () => {
    const edited = [paragraphs[0] ?? "", "Beta, said anew.", paragraphs[2] ?? ""];
    const c = configOf(paragraphs);
    const e = configOf(edited);
    const pickOf = (cfg: RunConfig, texts: readonly string[]) =>
      key(
        recipesFor(cfg, voiced(recipesFor(cfg, [], contentOf(texts)), {}), contentOf(texts)),
        "shorts:pick",
      ).fingerprint;
    expect(pickOf(e, edited)).not.toBe(pickOf(c, paragraphs));
    // The intro is not the body.
    const intro = { ...c, rendered: { ...c.rendered, intro: "Welcome back." } } as RunConfig;
    expect(pickOf(intro, paragraphs)).toBe(pickOf(c, paragraphs));
  });
});
