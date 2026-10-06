import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import {
  defaultVideoEdit,
  legacyVideoEdit,
  type VideoEditSettings,
} from "../video/edit-settings.js";
import { buildRecipes } from "./recipe-build.js";
import { animateFutureKey } from "./recipe-edit.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";
import { recipeProviderChoice } from "./recipe-provider-choice.js";
import { priceRecipes } from "./recipe-work.js";
import { planRevision } from "./recipes.js";

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  llm: { provider: "text", model: "text-model" },
  youtubeDescription: false,
};
const withShorts: RunConfig = {
  ...narrated,
  shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60 },
};
const captioned: RunConfig = {
  ...narrated,
  subtitles: {
    mode: "burn-in",
    language: "en",
    fontId: "default",
    fontSize: 48,
    position: "bottom",
  },
};

function fingerprints(c: RunConfig, value: RevisionContent = content) {
  const planned = planRevision(emptyView(c, value), { config: c, content: value });
  if (!planned.ok) throw new Error(JSON.stringify(planned.fields));
  return planned.fingerprints;
}

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

const edited = (c: RunConfig, over: Partial<VideoEditSettings>): RunConfig => ({
  ...c,
  videoEdit: { ...legacyVideoEdit, ...over },
});

describe("existing projects", () => {
  // No finished video may turn outdated: a project without the settings, or with every one
  // at today's behaviour, plans exactly the fingerprints it always did, with Shorts, captions
  // and the YouTube description on or off.
  it.each([
    ["a silent slideshow", config],
    ["a narrated slideshow", narrated],
    ["one with Shorts on", withShorts],
    ["one with burned-in captions", captioned],
    ["one with the YouTube description", { ...narrated, youtubeDescription: true }],
  ])("keeps every fingerprint of %s", (_name, c) => {
    const before = fingerprints(c);
    expect(fingerprints({ ...c, videoEdit: legacyVideoEdit })).toEqual(before);
    // Values that only matter once a feature is on change nothing while it is off.
    expect(
      fingerprints(edited(c, { transitionSeconds: 1.5, animateEvery: 7, animateModel: "m" })),
    ).toEqual(before);
    expect(recipesFor(c).find((one) => one.key === "export:video")?.fingerprint).toBe(
      recipesFor({ ...c, videoEdit: legacyVideoEdit }).find((one) => one.key === "export:video")
        ?.fingerprint,
    );
  });

  it("keeps a silent video's fingerprint when a new project would follow the narration", () => {
    // With no narration there is nothing to follow, so the cuts stay every N seconds.
    expect(fingerprints({ ...config, videoEdit: defaultVideoEdit })).toEqual(fingerprints(config));
  });
});

describe("the edit settings", () => {
  it("re-render only the video when the Look or the transition changes", () => {
    const before = fingerprints(narrated);
    for (const over of [
      { transition: "crossfade" as const },
      { vignette: "subtle" as const },
      { grain: "strong" as const },
      { grade: "sepia" as const },
      { atmosphere: "embers" as const },
    ]) {
      const after = fingerprints(edited(narrated, over));
      const changed = Object.keys(after).filter((key) => after[key] !== before[key]);
      expect(changed).toEqual(["export:video"]);
    }
  });

  it("time the words and wait for them when the cuts follow the narration", () => {
    const recipes = recipesFor(edited(narrated, { cuts: "narration" }));
    const video = recipes.find((one) => one.key === "export:video");
    expect(recipes.some((one) => one.key === "subtitles:timing")).toBe(true);
    expect(video?.dependsOn).toContain("subtitles:timing");
    // Captions stay off: only the timing is added.
    expect(recipes.some((one) => one.key === "subtitles:cues")).toBe(false);
  });

  it("read the chapters from the YouTube description when that step runs", () => {
    const recipes = recipesFor(
      edited({ ...narrated, youtubeDescription: true }, { chapterCards: true }),
    );
    expect(recipes.find((one) => one.key === "export:video")?.dependsOn).toEqual(
      expect.arrayContaining(["subtitles:timing", "youtube:description"]),
    );
  });

  it("ask for one paid clip per animated image, priced like an image of the video model", () => {
    const c = edited(narrated, { animate: "every", animateEvery: 2, animateModel: "kling" });
    const recipes = recipesFor(c);
    const animated = recipes.filter((one) => one.key.startsWith("animate:"));
    // Two images, every 2nd from the first: the first.
    expect(animated.map((one) => one.key)).toEqual(["animate:harbor"]);
    const request = animated[0];
    expect(request?.kind).toBe("provider");
    expect(request?.input).toMatchObject({
      kind: "image",
      provider: "fal",
      model: "kling",
      aspect: "16:9",
      animate: { seconds: 5 },
    });
    expect(request?.dependsOn).toEqual(["image:harbor"]);
    expect(recipes.find((one) => one.key === "export:video")?.dependsOn).toContain(
      "animate:harbor",
    );
    expect(request === undefined ? undefined : recipeProviderChoice(request, c)).toMatchObject({
      provider: "fal",
      model: "kling",
      family: "image",
    });
  });

  it("leave uploaded images and clips unanimated", () => {
    const value: RevisionContent = {
      ...content,
      imageDefinitions: {
        ...content.imageDefinitions,
        harbor: { source: "provide", assetId: "asset-1", prompt: null },
      },
    };
    const c = edited(narrated, { animate: "every", animateEvery: 2, animateModel: "kling" });
    expect(recipesFor(c, [], value).filter((one) => one.key.startsWith("animate:"))).toEqual([]);
  });

  it("stand in for the chapter openers until the word timing lands, charging the most they can cost", () => {
    const c = edited(narrated, { animate: "chapters", animateModel: "kling" });
    const future = recipesFor(c).find((one) => one.key === animateFutureKey);
    expect(future?.deferred).toBe(true);
    expect(future?.dependsOn).toEqual(["subtitles:timing"]);
    const priced =
      future === undefined
        ? []
        : priceRecipes(
            { key: future.key, stage: "video", disposition: "generate" } as never,
            future,
          );
    // The article has no headings: the opening only, capped by the two drawn images.
    expect(priced).toHaveLength(1);
    expect(priced[0]).toMatchObject({ kind: "image", provider: "fal", model: "kling" });
  });

  it("unfold the chapter openers once the word timing is saved", () => {
    const c = edited(narrated, { animate: "chapters", animateModel: "kling" });
    const timing = recipesFor(c).find((one) => one.key === "subtitles:timing");
    if (timing === undefined) throw new Error("no timing");
    // Two paragraphs, one word a second: no headings, so only the opening shot is a chapter
    // opener, and it shows the first image.
    const words = [
      { text: "First", start: 0, end: 0.9 },
      { text: "paragraph.", start: 1, end: 1.9 },
      { text: "Second", start: 2, end: 2.9 },
      { text: "paragraph.", start: 3, end: 3.9 },
    ];
    const recipes = recipesFor(c, [
      {
        key: timing.key,
        stageKind: "video",
        assetId: null,
        fingerprint: timing.fingerprint,
        piece: {
          id: "timing",
          stageId: "video",
          kind: "article_written",
          idx: 1,
          state: "done",
          payload: JSON.stringify({ words, omissions: [] }),
        },
      },
    ]);
    expect(recipes.some((one) => one.key === animateFutureKey)).toBe(false);
    expect(recipes.filter((one) => one.key.startsWith("animate:")).map((one) => one.key)).toEqual([
      "animate:harbor",
    ]);
  });
});

describe("a finished video and its YouTube description", () => {
  const c = edited({ ...narrated, youtubeDescription: true }, { chapterCards: true });
  const done = (key: string, fingerprint: string, assetId: string | null): ManifestPiece => ({
    key,
    stageKind: "video",
    assetId,
    fingerprint,
    piece: {
      id: key,
      stageId: "video",
      kind: "article_written",
      idx: 1,
      state: "done",
      payload: null,
    },
  });
  const find = (recipes: readonly ResolvedWorkRecipe[], key: string) =>
    recipes.find((one) => one.key === key);
  const build = (
    value: RevisionContent,
    pieces: readonly ManifestPiece[],
    history?: readonly ManifestPiece[],
  ) =>
    buildRecipes({
      config: c,
      content: value,
      manifest: { outputs: [], pieces },
      ...(history === undefined ? {} : { history: { outputs: [], pieces: history } }),
      resolved: { articleMarkdown: emptyView(c, value).articleMarkdown, researchNotes: null },
    });

  it("keeps the video when only the description is written again", () => {
    const first = build(content, []);
    const description = find(first, "youtube:description");
    const video = find(first, "export:video");
    if (description === undefined || video === undefined) throw new Error("no recipes");
    const oldDescription = done("youtube:description", description.fingerprint, null);
    const rendered = done("export:video", video.fingerprint, "video-file");
    // Written again: a new regeneration token gives the description a new fingerprint.
    const again: RevisionContent = {
      ...content,
      regenerationTokens: { ...content.regenerationTokens, "youtube:description": "again" },
    };
    const rewritten = build(again, [rendered], [rendered, oldDescription]);
    expect(find(rewritten, "youtube:description")?.fingerprint).not.toBe(description.fingerprint);
    // The video keeps the description its chapter cards were drawn from.
    expect(find(rewritten, "export:video")?.fingerprint).toBe(video.fingerprint);
    // Without the earlier description to pin to, it would have been remade.
    expect(find(build(again, [rendered]), "export:video")?.fingerprint).not.toBe(video.fingerprint);
  });

  it("still remakes the video when what it shows changes", () => {
    const first = build(content, []);
    const description = find(first, "youtube:description");
    const video = find(first, "export:video");
    if (description === undefined || video === undefined) throw new Error("no recipes");
    const rendered = done("export:video", video.fingerprint, "video-file");
    const history = [rendered, done("youtube:description", description.fingerprint, null)];
    const recut = buildRecipes({
      config: edited(c, { chapterCards: true, transition: "crossfade" }),
      content,
      manifest: { outputs: [], pieces: [rendered] },
      history: { outputs: [], pieces: history },
      resolved: { articleMarkdown: emptyView(c, content).articleMarkdown, researchNotes: null },
    });
    expect(find(recut, "export:video")?.fingerprint).not.toBe(video.fingerprint);
  });
});
