import { randomUUID } from "node:crypto";
import { createCatalogueStore } from "../../catalog/store.js";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { Paths } from "../../kernel/paths.js";
import { resolveFont } from "../fonts/index.js";
import { createPrompt } from "../library/save.js";
import type { DraftReviewDeps, PlayDraftDocument } from "../play-drafts/model.js";

// Play's review over any test database, on the bundled model list, with no network.
export function reviewOver(deps: {
  readonly db: import("node:sqlite").DatabaseSync;
  readonly paths: Paths;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
}): DraftReviewDeps {
  const catalogue = createCatalogueStore({
    dataDir: deps.paths.dataDir,
    fetch: async () => {
      throw new Error("Network is forbidden in this fixture");
    },
  });
  return {
    db: deps.db,
    paths: deps.paths,
    ids: deps.ids,
    clock: deps.clock,
    log: deps.log,
    uuid: randomUUID,
    catalogue,
    resolveFont: (fontId) => resolveFont(deps.paths, fontId),
    modelsFor: async (provider, family) =>
      catalogue.models(provider, family).map((model) => ({ id: model.id, name: model.name })),
  };
}

// A template setup whose sample is paid: an article written by OpenRouter and narrated by
// ElevenLabs, both priced in the bundled list. Its article prompt is saved in `deps`' library.
export function paidDocument(deps: DraftReviewDeps): PlayDraftDocument {
  const prompt = createPrompt(deps, {
    kind: "article",
    name: "Documentary",
    body: "Write a 1500-word documentary script about {{Topic}}.",
  });
  if (!prompt.ok) throw new Error("The fixture's article prompt was refused.");
  return {
    schemaVersion: 1,
    section: "content",
    variants: [],
    expectedWords: "1500",
    previewText: "Every story begins with a word.",
    fontUpload: null,
    form: {
      title: "History: {{Topic}}",
      format: "16:9",
      sources: {
        research: "off",
        article: "generate",
        audio: "generate",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      llm: { provider: "openrouter", model: "google/gemini-3.1-pro-preview" },
      audio: { provider: "elevenlabs", model: "eleven_v4", voice: "v" },
      images: { provider: "", model: "" },
      articlePrompt: "Documentary",
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
      values: { Topic: "" },
      provided: { research: "", article: "", audio: null, thumbnail: null, images: [] },
    },
  };
}
