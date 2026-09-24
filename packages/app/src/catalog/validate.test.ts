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
    };
    expect(modelFields(draft, catalogue)).toEqual([]);
    expect(
      modelFields(
        { ...draft, llm: { provider: "openrouter", model: "exact-saved-id" } },
        catalogue,
      ),
    ).toContainEqual({
      field: "llm",
      message: "Choose an enabled model from the current catalogue.",
    });
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
