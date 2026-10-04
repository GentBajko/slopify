import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import { planAddedOutput } from "./add.js";

const article: RunConfig = {
  title: "Tides",
  format: "16:9",
  sources: {
    research: "generate",
    article: "generate",
    audio: "off",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  audio: { provider: "openai-tts", model: "tts", voice: "alloy" },
  imagePrompts: [],
  values: {},
  provided: {},
  silenceGapSeconds: 0,
  imageSeconds: 15,
  zoomPercent: 22.5,
  motionStyle: "zoom",
  edgeSilenceSeconds: 0,
  rendered: {},
  youtubeDescription: true,
};

describe("planAddedOutput", () => {
  it("adds narration over the accepted article and nothing about a video", () => {
    const result = planAddedOutput(article, "narration");
    if (!result.ok) throw new Error(result.message);
    expect(result.plan.stages).toEqual(["audio"]);
    expect(result.plan.config.sources.audio).toBe("generate");
    expect(result.plan.config.sources.article).toBe("generate");
    expect(result.plan.config.youtubeDescription).toBeUndefined();
    expect(result.plan.reused).toEqual([
      "Brief: title, prompts and keywords",
      "Research notes and sources",
      "Accepted article text",
    ]);
    expect(result.plan.textUse).toMatch(/as written/);
  });

  it("adds a video with the narration and images it needs, keeping the description choice", () => {
    const result = planAddedOutput(article, "video");
    if (!result.ok) throw new Error(result.message);
    expect(result.plan.stages).toEqual(["audio", "images", "video"]);
    expect(result.plan.config.youtubeDescription).toBe(true);
    expect(result.plan.created).toContain("The rendered video");
  });

  it("adds an audiobook read as written by one narrator in the project's voice", () => {
    expect(planAddedOutput(article, "audiobook")).toMatchObject({
      ok: true,
      plan: { adapts: false },
    });
    const result = planAddedOutput(article, "audiobook");
    if (!result.ok) throw new Error(result.message);
    expect(result.plan.config.voices?.source).toBe("attribute");
    expect(result.plan.config.voices?.audioFiles).toBe(true);
    expect(result.plan.config.voices?.speakers[0]?.voice.voice).toBe("alloy");
    expect(result.plan.created).toContain("Chaptered MP3 and M4B files");
  });

  it("adds a PDF without touching the article", () => {
    const result = planAddedOutput(article, "pdf");
    if (!result.ok) throw new Error(result.message);
    expect(result.plan.stages).toEqual(["document"]);
    expect(result.plan.config.sources.document).toBe("generate");
  });

  it("adds a podcast as an explicit adaptation that keeps the article as written", () => {
    const result = planAddedOutput(article, "podcast");
    if (!result.ok) throw new Error(result.message);
    expect(result.plan.adapts).toBe(true);
    expect(result.plan.config.sources.article).toBe("generate");
    expect(result.plan.config.voices).toMatchObject({
      format: "podcast",
      source: "adapt",
      audioFiles: true,
    });
    expect(result.plan.config.voices?.speakers.map((one) => one.voice.voice)).toEqual([
      "alloy",
      "",
    ]);
    expect(result.plan.textUse).toMatch(/article stays as written/);
    expect(result.plan.created[0]).toBe("A conversation script adapted from your article");
  });

  it("refuses what is already made, what has no text, and a second narration", () => {
    const narrated = { ...article, sources: { ...article.sources, audio: "generate" as const } };
    expect(planAddedOutput(narrated, "narration")).toMatchObject({ ok: false, reason: "already" });
    expect(planAddedOutput(narrated, "podcast")).toMatchObject({
      ok: false,
      reason: "narration-taken",
    });
    expect(planAddedOutput(narrated, "audiobook")).toMatchObject({
      ok: false,
      reason: "narration-taken",
    });
    const empty = { ...article, sources: { ...article.sources, article: "off" as const } };
    expect(planAddedOutput(empty, "pdf")).toMatchObject({ ok: false, reason: "needs-article" });
  });
});
