import { describe, expect, it } from "vitest";
import type { RunConfig, RunDraft } from "../admission/model.js";
import { admit } from "../admission/rules.js";
import { shortModeFields } from "../admission/short-mode.js";
import { config, content, emptyView } from "./recipe-fixture.js";
import { planRevision } from "./recipes.js";

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
};
const short: RunConfig = {
  ...narrated,
  mode: "short",
  format: "9:16",
  title: "Why the sea glows",
};

function plan(value: RunConfig) {
  const result = planRevision(emptyView(value), { config: value, content });
  if (!result.ok) throw new Error(JSON.stringify(result.fields));
  return result;
}

describe("short mode's stage plan", () => {
  it("renders the whole narration as one short from the word timing, and nothing else", () => {
    const recipes = plan(short).recipes;
    const keys = recipes.map((one) => one.key);
    expect(keys).toContain("subtitles:timing");
    expect(keys.some((key) => key.startsWith("thumbnail") || key.startsWith("document"))).toBe(
      false,
    );
    expect(keys.some((key) => key.startsWith("shorts:"))).toBe(false);
    const video = recipes.find((one) => one.key === "export:video");
    expect(video?.dependsOn).toContain("subtitles:timing");
    expect(video?.dependsOn).toEqual(expect.arrayContaining(["image:harbor", "image:hill"]));
  });

  it("keeps every long video's plan and fingerprints as they were", () => {
    const before = plan(narrated);
    const explicit = plan({ ...narrated, mode: "video" });
    expect(explicit.fingerprints).toEqual(before.fingerprints);
    // A long video without captions or a description needs no word timing.
    expect(Object.keys(before.fingerprints)).not.toContain("subtitles:timing");
  });

  it("re-renders only the short when its title changes", () => {
    const a = plan(short).fingerprints;
    const b = plan({ ...short, title: "Why the sea glows at night" }).fingerprints;
    const changed = Object.keys(b).filter((key) => a[key] !== b[key]);
    expect(changed).toEqual(["export:video"]);
  });

  it("ignores the video edit settings, which the shorts renderer does not use", () => {
    const edited = plan({
      ...short,
      videoEdit: {
        cuts: "interval",
        transition: "crossfade",
        transitionSeconds: 1,
        vignette: "off",
        grain: "off",
        grade: "none",
        atmosphere: "none",
        chapterCards: false,
        animate: "off",
        animateEvery: 3,
        animateModel: "",
      },
    });
    expect(edited.fingerprints).toEqual(plan(short).fingerprints);
  });

  it("refuses a Save that breaks the mode", () => {
    const result = planRevision(emptyView(short), {
      config: { ...short, format: "16:9" },
      content,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.fields.map((one) => one.field)).toContain("format");
  });
});

describe("short mode's admission", () => {
  const draft: RunDraft = {
    mode: "short",
    title: "Why the sea glows",
    format: "9:16",
    sources: {
      research: "off",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "off",
      video: "generate",
    },
    llm: { provider: "claude-code", model: "sonnet" },
    audio: { provider: "openai-tts", model: "gpt-4o-mini-tts", voice: "onyx" },
    images: { provider: "codex-image", model: "codex-imagegen" },
    articlePrompt: "Short script",
    imagePrompts: [{ name: "Short scene", number: 4 }],
    values: { topic: "bioluminescence" },
    provided: {},
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 10,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0.5,
  };

  it("admits a vertical short with narration and images", () => {
    expect(admit({ draft, staged: [], requiredSlots: ["topic"] })).toMatchObject({ ok: true });
  });

  it("names every control that breaks the mode", () => {
    const fields = shortModeFields({
      ...draft,
      format: "16:9",
      sources: {
        ...draft.sources,
        audio: "off",
        images: "off",
        video: "off",
        thumbnail: "from_prompt",
        document: "generate",
      },
      shorts: { enabled: true, count: 2, minSeconds: 30, maxSeconds: 60 },
    }).map((one) => one.field);
    expect(fields).toEqual([
      "format",
      "sources.video",
      "sources.audio",
      "sources.images",
      "sources.thumbnail",
      "sources.document",
      "shorts.enabled",
    ]);
  });

  it("leaves a long video's admission alone", () => {
    expect(shortModeFields({ ...draft, mode: undefined, format: "16:9" })).toEqual([]);
    expect(
      admit({ draft: { ...draft, mode: "short", format: "16:9" }, staged: [], requiredSlots: [] }),
    ).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([expect.objectContaining({ field: "format" })]),
    });
  });
});
