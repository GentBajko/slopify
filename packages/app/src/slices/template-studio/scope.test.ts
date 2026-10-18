import { describe, expect, it } from "vitest";
import { type PlayDraftDocument, playDraftDocumentSchema } from "../play-drafts/schema.js";
import { sampleDocument, sampleNarrationText } from "./scope.js";

const base: PlayDraftDocument = {
  schemaVersion: 1,
  section: "content",
  variants: [{ id: "00000000-0000-4000-8000-000000000001", title: "Another", values: {} }],
  expectedWords: "1500",
  previewText: "Every story begins with a word.",
  fontUpload: null,
  form: {
    title: "",
    format: "16:9",
    sources: {
      research: "off",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "off",
      video: "generate",
    },
    llm: { provider: "", model: "" },
    audio: { provider: "", model: "", voice: "" },
    images: { provider: "", model: "" },
    articlePrompt: "",
    imagePrompts: [],
    thumbnailPrompt: "",
    intro: "",
    outro: "",
    chunking: { mode: "whole", words: "500", characters: "3000" },
    subtitles: {
      mode: "off",
      language: "en",
      fontId: "default",
      fontSize: "48",
      position: "bottom",
    },
    imageSeconds: "15",
    edgeSilenceSeconds: "2",
    zoomPercent: "22.5",
    motionStyle: "zoom",
    values: {},
    provided: { research: "", article: "", audio: null, thumbnail: null, images: [] },
  },
};

const template = playDraftDocumentSchema.parse({
  ...base,
  form: {
    ...base.form,
    title: "History: {{Topic}}",
    values: { Topic: "", Era: "Victorian" },
    checkpoints: ["images", "video"],
    thumbnailCount: 3,
    imagePrompts: [
      { name: "Scenes", number: "3" },
      { name: "Maps", number: "2" },
      { name: "Portraits", number: "2" },
    ],
    imageScale: { every: "minutes", value: "2" },
    shorts: {
      enabled: true,
      count: "4",
      minSeconds: "60",
      maxSeconds: "120",
      prompt: "",
      imagePrompt: "",
    },
    sources: { ...base.form.sources, audio: "provide", thumbnail: "provide" },
  },
});

describe("sampleDocument", () => {
  const sample = sampleDocument(template, { topic: "  Salt roads ", fullScript: false });

  it("fills the title's empty keywords with the topic and keeps every other value", () => {
    expect(sample.form.title).toBe("History: {{Topic}}");
    expect(sample.form.values).toEqual({ Topic: "Salt roads", Era: "Victorian" });
  });

  it("makes the topic the title when the title names no keyword", () => {
    const plain = sampleDocument(
      { ...template, form: { ...template.form, title: "Weekly show" } },
      { topic: "Salt roads", fullScript: false },
    );
    expect(plain.form.title).toBe("Salt roads");
  });

  it("draws at most four pictures, one thumbnail and one short, and never stops at a checkpoint", () => {
    expect(sample.form.imagePrompts).toEqual([
      { name: "Scenes", number: "3" },
      { name: "Maps", number: "1" },
    ]);
    expect(sample.form.imageScale).toBeUndefined();
    expect(sample.form.thumbnailCount).toBe(1);
    expect(sample.form.shorts?.count).toBe("1");
    expect(sample.form.checkpoints).toEqual([]);
  });

  it("turns off what the user provides at run time, with no file to attach", () => {
    expect(sample.form.sources.audio).toBe("off");
    expect(sample.form.sources.thumbnail).toBe("off");
    expect(sample.form.sources.article).toBe(template.form.sources.article);
    expect(sample.form.provided.audio).toBeNull();
    expect(sample.form.provided.images).toEqual([]);
  });

  it("never asks an agent's reviews, which are answered outside Slopify", () => {
    const reviewed = sampleDocument(
      {
        ...template,
        form: {
          ...template.form,
          reviews: {
            provider: "openrouter",
            model: "m",
            reviewer: "agent",
            retries: "1",
            stages: { article: { mode: "flag", prompt: "" } },
          },
        },
      },
      { topic: "Salt roads", fullScript: false },
    );
    expect(reviewed.form.reviews?.stages).toEqual({});
  });

  it("makes one video, never the template's queued extra ones", () => {
    expect(sample.variants).toEqual([]);
  });

  it("keeps research or an article the template itself holds as text", () => {
    const pasted = sampleDocument(
      {
        ...template,
        form: {
          ...template.form,
          sources: { ...template.form.sources, article: "provide", research: "provide" },
          provided: { ...template.form.provided, article: "A pasted article.", research: " " },
        },
      },
      { topic: "Salt roads", fullScript: false },
    );
    expect(pasted.form.sources.article).toBe("provide");
    expect(pasted.form.provided.article).toBe("A pasted article.");
    expect(pasted.form.sources.research).toBe("off");
    expect(pasted.form.provided.research).toBe("");
  });

  it("is still a document Play reads", () => {
    expect(playDraftDocumentSchema.safeParse(sample).success).toBe(true);
  });
});

describe("sampleNarrationText", () => {
  it("keeps whole sentences up to about the words asked for", () => {
    expect(sampleNarrationText("One two three. Four five six. Seven eight nine.", 6)).toBe(
      "One two three. Four five six.",
    );
  });

  it("keeps the first sentence even when it alone is longer", () => {
    expect(sampleNarrationText("One two three four five. Six.", 2)).toBe(
      "One two three four five.",
    );
  });

  it("keeps a text shorter than the limit whole", () => {
    expect(sampleNarrationText("Short and sweet", 80)).toBe("Short and sweet");
  });
});
