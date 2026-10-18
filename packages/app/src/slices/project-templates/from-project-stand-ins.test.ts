import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { startRun } from "../admission/start.js";
import { retiredStatus } from "../model-upkeep/usage.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { currentRevisionId } from "../revisions/repo.js";
import { createTemplateFromProject } from "./from-project.js";
import { readTemplate } from "./service.js";
import { withoutSampleStandIns } from "./stand-ins.js";

// The bundled samples are made by local stand-ins (sample-writer, sample-artist, sample-voice)
// that only exist while the sample archives are built. A template made from a sample asks for
// the person's own providers instead of carrying them, and they are never called retired.
const emptyCatalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-10-18",
  providers: {},
  llm: [],
  image: [],
  tts: [],
};

describe("sample stand-in providers", () => {
  it("leaves a template made from a sample to the person's own providers", () => {
    const h = startFixture();
    try {
      const project = startRun(
        h.deps,
        {
          title: "Lighthouses",
          format: "16:9",
          sources: {
            research: "off",
            article: "generate",
            audio: "off",
            images: "generate",
            thumbnail: "off",
            video: "off",
          },
          articlePrompt: "Story",
          llm: { provider: "sample-writer", model: "scripted" },
          images: { provider: "sample-artist", model: "codex-painted" },
          imagePrompts: [{ name: "Wide", number: 1 }],
          values: {},
          provided: {},
          silenceGapSeconds: 0,
          imageSeconds: 15,
          zoomPercent: 22.5,
          motionStyle: "mixed",
          edgeSilenceSeconds: 0,
        },
        { article: "Write", "imagePrompts.0": "A wide shot" },
        false,
        { article: "Write", "imagePrompts.0": "A wide shot" },
      ).project;
      const revisionId = currentRevisionId(h.deps.db, project.id);
      if (!revisionId) throw new Error("Missing fixture revision");
      const template = createTemplateFromProject(h.deps, {
        id: randomUUID(),
        name: "Lighthouse histories",
        projectId: project.id,
        revisionId,
      });
      if (!template.ok) throw new Error("Project template failed");
      expect(template.value.document.form.llm).toEqual({ provider: "", model: "" });
      expect(template.value.document.form.images).toEqual({ provider: "", model: "" });
      const read = readTemplate(h.deps, template.value.id);
      if (!read.ok) throw new Error("Template read failed");
      expect(read.value.document.form.llm.provider).toBe("");
    } finally {
      h.close();
    }
  });

  it("clears stand-ins from a form, keeping real choices and speakers' names", () => {
    const form = {
      llm: { provider: "openrouter", model: "a/b" },
      audio: { provider: "sample-voice", model: "tones", voice: "low" },
      images: { provider: "sample-artist", model: "procedural" },
      voices: {
        format: "audiobook" as const,
        source: "script" as const,
        speakers: [
          {
            id: "narrator",
            name: "Ada",
            role: "narrator" as const,
            voice: { provider: "sample-voice", model: "tones", voice: "low" },
          },
        ],
        turnGapSeconds: 0.35,
        nameTags: false,
        nativeDialogue: false,
        audioFiles: false,
      },
    };
    const clean = withoutSampleStandIns(form);
    expect(clean.llm).toEqual({ provider: "openrouter", model: "a/b" });
    expect(clean.audio).toEqual({ provider: "", model: "", voice: "" });
    expect(clean.images).toEqual({ provider: "", model: "" });
    expect(clean.voices?.speakers[0]?.name).toBe("Ada");
    expect(clean.voices?.speakers[0]?.voice).toEqual({ provider: "", model: "", voice: "" });
  });

  it("never calls a stand-in a retired or unlisted model", () => {
    expect(
      retiredStatus(emptyCatalogue, "llm", { provider: "sample-writer", model: "scripted" }),
    ).toBeNull();
    expect(
      retiredStatus(emptyCatalogue, "images", {
        provider: "sample-artist",
        model: "codex-painted",
      }),
    ).toBeNull();
  });
});
