import { expect, it } from "vitest";
import type { RunDraft } from "../slices/admission/model.js";
import { createCatalogueStore } from "./store.js";
import { modelFields } from "./validate.js";

it("leaves local CLI IDs to async validation while retaining API catalogue checks", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-validation-"));
  try {
    const catalogue = createCatalogueStore({
      dataDir,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const draft: RunDraft = {
      title: "Generated",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "codex", model: "exact-saved-id" },
      imagePrompts: [],
      values: {},
      provided: {},
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
    };
    expect(modelFields(draft, catalogue)).toEqual([]);
    expect(
      modelFields(
        { ...draft, llm: { provider: "openrouter", model: "exact-saved-id" } },
        catalogue,
      ),
    ).toContainEqual({
      field: "llm",
      message: "This model is no longer in Slopify's model list. Choose another model.",
    });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it("refuses an establishing image for a model that can't take one, naming the controls", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-validation-"));
  try {
    const catalogue = createCatalogueStore({
      dataDir,
      fetch: async () => {
        throw new Error("offline");
      },
    });
    const draft: RunDraft = {
      title: "Generated",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "generate",
        thumbnail: "off",
        video: "off",
      },
      images: { provider: "replicate", model: "black-forest-labs/flux-1.1-pro" },
      reference: { source: "prompt", prompt: "Cast" },
      imagePrompts: [{ name: "Scene", number: 1 }],
      values: {},
      provided: { article: "Text" },
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
    };
    const refused = modelFields(draft, catalogue).find(
      (field) => field.field === "reference.source",
    );
    expect(refused?.message).toContain("can't use an establishing image");
    expect(refused?.message).toContain("Images → Model");
    expect(refused?.message).toContain("set Establishing image to Off in the Images section");
    // The models the catalogue marks as taking a reference, and the Codex CLI, are accepted.
    for (const images of [
      { provider: "openai-image", model: "gpt-image-2" },
      { provider: "google-image", model: "gemini-3.1-flash-image" },
      { provider: "fal", model: "fal-ai/nano-banana-2" },
      { provider: "codex-image", model: "codex-imagegen" },
    ])
      expect(
        modelFields({ ...draft, images }, catalogue).some((f) => f.field === "reference.source"),
      ).toBe(false);
    // Off, nothing is asked of the model.
    const { reference: _off, ...plain } = draft;
    expect(modelFields(plain, catalogue).some((f) => f.field === "reference.source")).toBe(false);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
