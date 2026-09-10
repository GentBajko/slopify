import { expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { planDependencies } from "./dependencies.js";
import { config, content, emptyView, readyView, workFor } from "./recipe-fixture.js";
import { normalizeArticleIntent, planRevision, visualRecipes } from "./recipes.js";

it("reordering retained images rebuilds only the video", () => {
  const old = visualRecipes(config, content, null, null);
  const next = visualRecipes(config, { ...content, imageOrder: ["hill", "harbor"] }, null, null);
  expect(
    planDependencies(
      next,
      old.map((r) => ({ ...r, available: true, inflight: false, pieceIds: [] })),
    ).map((r) => [r.key, r.disposition]),
  ).toEqual([
    ["image:hill", "reuse"],
    ["image:harbor", "reuse"],
    ["export:video", "local"],
  ]);
});
it("does not generate retained disabled images", () => {
  expect(
    visualRecipes(
      { ...config, sources: { ...config.sources, images: "off", video: "off" } },
      content,
      null,
      null,
    ),
  ).toEqual([]);
});
it("waits for the complete timeline and burned captions without thumbnail dependency", () => {
  const c: RunConfig = {
    ...config,
    sources: { ...config.sources, audio: "generate" },
    intro: { name: "Intro", mode: "text" },
    outro: { name: "Outro", mode: "text" },
    subtitles: {
      mode: "burn-in",
      language: "en",
      fontId: "default",
      fontSize: 48,
      position: "bottom",
    },
  };
  expect(
    visualRecipes(c, content, "timeline", "captions").find((r) => r.key === "export:video")
      ?.dependsOn,
  ).toEqual([
    "image:harbor",
    "image:hill",
    "audio:body:concat",
    "audio:intro",
    "audio:outro",
    "subtitles:files",
  ]);
});
it("renders only explicitly linked templates independently of item ordering", () => {
  const linked = {
    ...content,
    imageDefinitions: {
      ...content.imageDefinitions,
      harbor: {
        source: "generate" as const,
        assetId: null,
        prompt: "Day harbor",
        templateKey: "imagePrompts.0",
      },
    },
    promptTemplates: { "imagePrompts.0": "{{place}} harbor" },
  };
  const base = readyView({ ...config, values: { place: "Day" } }, linked);
  const work = workFor(
    base,
    { ...config, values: { place: "Night" } },
    { ...linked, imageOrder: ["hill", "harbor"] },
  ).work;
  expect(work.filter((r) => r.key.startsWith("image:")).map((r) => [r.key, r.disposition])).toEqual(
    [
      ["image:hill", "reuse"],
      ["image:harbor", "generate"],
    ],
  );
});
it.each(["order", "prompt"])(
  "retains every asset while marking affected %s output outdated",
  (change) => {
    const base = readyView();
    const next =
      change === "order"
        ? { ...content, imageOrder: ["hill", "harbor"] }
        : {
            ...content,
            imageDefinitions: {
              ...content.imageDefinitions,
              harbor: { source: "generate" as const, assetId: null, prompt: "Night" },
            },
          };
    const result = planRevision(base, { config, content: next });
    if (!result.ok) throw new Error("Valid edit rejected");
    expect(
      ["image:harbor", "image:hill", "export:video"].map(
        (key) => result.manifest.outputs.find((r) => r.workKey === key)?.state,
      ),
    ).toEqual(
      change === "order" ? ["ready", "ready", "outdated"] : ["outdated", "ready", "outdated"],
    );
    expect(result.manifest.outputs.map((r) => r.assetId)).toEqual(
      base.outputs.map((r) => r.assetId),
    );
  },
);
it("distinguishes retained generated text from explicit editing and regeneration", () => {
  const generated: RunConfig = { ...config, sources: { ...config.sources, article: "generate" } };
  const base = emptyView(generated);
  const prompt = { config: { ...generated, rendered: { article: "New request" } }, content };
  expect(normalizeArticleIntent(base, prompt).articleEdited).toBe(false);
  expect(
    normalizeArticleIntent(base, { ...prompt, content: { ...content, articleMarkdown: "Edited." } })
      .articleEdited,
  ).toBe(true);
  const manual = emptyView(generated, { ...content, articleEdited: true });
  expect(normalizeArticleIntent(manual, prompt).articleEdited).toBe(true);
  expect(
    normalizeArticleIntent(manual, { ...prompt, regenerate: ["article:body"] }).articleEdited,
  ).toBe(false);
  expect(
    normalizeArticleIntent(emptyView(), {
      config: generated,
      content: { ...content, articleEdited: true },
    }).articleEdited,
  ).toBe(false);
  expect(
    normalizeArticleIntent({ ...base, articleMarkdown: "Published later." }, prompt).articleEdited,
  ).toBe(false);
});
it.each([
  {
    name: "article only to audio",
    audio: "generate",
    images: "off",
    video: "off",
    expected: ["audio:body:concat", "export:wav"],
  },
  {
    name: "audio to video",
    audio: "generate",
    images: "generate",
    video: "generate",
    expected: ["audio:body:concat", "export:video"],
  },
  {
    name: "video to WAV",
    audio: "generate",
    images: "generate",
    video: "off",
    expected: ["audio:body:concat", "export:wav"],
  },
  {
    name: "silent video",
    audio: "off",
    images: "generate",
    video: "generate",
    expected: ["export:video"],
  },
  { name: "both off", audio: "off", images: "off", video: "off", expected: [] },
] as const)("plans $name", ({ audio, images, video, expected }) => {
  const c = { ...config, sources: { ...config.sources, audio, images, video } };
  const work = workFor(emptyView(c)).work;
  expect(
    work
      .filter((r) => r.key.startsWith("export:") || r.key === "audio:body:concat")
      .map((r) => r.key),
  ).toEqual(expected);
});
it("rejects deleting the last active image until Images and Video are both Off", () => {
  expect(
    planRevision(readyView(), {
      config,
      content: { ...content, imageOrder: [], imageDefinitions: {} },
    }),
  ).toMatchObject({ ok: false, fields: [{ field: "content.imageOrder" }] });
  expect(
    planRevision(readyView(), {
      config: { ...config, sources: { ...config.sources, images: "off" } },
      content,
    }),
  ).toMatchObject({ ok: false, fields: [{ field: "sources.video" }] });
});
it("normalizes mixed images and clears provided image prompt provenance", () => {
  const next = {
    ...content,
    imageDefinitions: {
      ...content.imageDefinitions,
      harbor: {
        source: "provide" as const,
        assetId: "replacement",
        prompt: "Old prompt",
        templateKey: "old",
      },
    },
  };
  const result = planRevision(emptyView(), {
    config: { ...config, sources: { ...config.sources, images: "provide" } },
    content: next,
  });
  expect(result).toMatchObject({
    ok: true,
    config: { sources: { images: "generate" } },
    content: { imageDefinitions: { harbor: { prompt: null, templateKey: null } } },
  });
});
it.each([
  {
    field: "audio",
    next: {
      ...config,
      sources: { ...config.sources, audio: "generate" as const },
      audio: undefined,
    },
  },
  {
    field: "llm",
    next: {
      ...config,
      sources: { ...config.sources, article: "generate" as const },
      llm: undefined,
    },
  },
  { field: "images", next: { ...config, images: undefined } },
  { field: "chunking.words", next: { ...config, chunking: { mode: "words" as const, words: 0 } } },
])("returns a field error for unusable $field selection", ({ field, next }) => {
  const result = planRevision(emptyView(), { config: next, content });
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("Invalid selection accepted");
  expect(result.fields.some((row) => row.field === field)).toBe(true);
});
it("validates active raw template keywords without rejecting disabled image definitions", () => {
  const linked = {
    ...content,
    imageDefinitions: {
      ...content.imageDefinitions,
      harbor: {
        source: "generate" as const,
        assetId: null,
        prompt: "Harbor",
        templateKey: "image:harbor",
      },
    },
    promptTemplates: { "image:harbor": "{{place}} harbor" },
  };
  expect(planRevision(emptyView(), { config, content: linked })).toMatchObject({ ok: false });
  expect(
    planRevision(emptyView(), {
      config: { ...config, sources: { ...config.sources, images: "off", video: "off" } },
      content: linked,
    }),
  ).toMatchObject({ ok: true });
});
