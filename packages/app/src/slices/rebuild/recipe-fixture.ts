import type { Catalogue } from "../../catalog/schema.js";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent, RevisionView } from "../revisions/model.js";
import { planRevision, planRevisionWork, type RevisionWorkPlan } from "./recipes.js";
export const config: RunConfig = {
  title: "Saved",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "off",
    images: "generate",
    thumbnail: "off",
    video: "generate",
  },
  llm: { provider: "text", model: "text-model" },
  audio: { provider: "voice", model: "tts", voice: "v1" },
  images: { provider: "fal", model: "image-model" },
  imagePrompts: [],
  values: {},
  provided: { article: "First paragraph.\n\nSecond paragraph." },
  silenceGapSeconds: 0,
  rendered: { article: "Write an article." },
};
export const content: RevisionContent = {
  articleMarkdown: config.provided.article,
  articleEdited: false,
  provided: {},
  imageOrder: ["harbor", "hill"],
  imageDefinitions: {
    harbor: { source: "generate", assetId: null, prompt: "Harbor" },
    hill: { source: "generate", assetId: null, prompt: "Hill" },
  },
  narrationOverrides: {},
  regenerationTokens: {},
  promptTemplates: {},
};
export const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-10",
  providers: {},
  llm: [
    {
      provider: "text",
      id: "text-model",
      name: "Text",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: true, thinking: { high: { budget: 1024 } } },
    },
  ],
  tts: [
    {
      provider: "voice",
      id: "tts",
      name: "Voice",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: { perMillionCharacters: 25 },
      tts: { maxCharacters: 1000, streaming: true },
    },
  ],
  image: [],
};
export function emptyView(c: RunConfig = config, value: RevisionContent = content): RevisionView {
  return {
    revision: {
      id: "r1",
      projectId: "p1",
      parentId: null,
      restoredFromId: null,
      config: c,
      content: value,
      fingerprints: {},
      createdAt: "2026-09-10T00:00:00Z",
    },
    outputs: [],
    pieces: [],
    current: true,
    articleMarkdown: value.articleMarkdown ?? c.provided.article ?? null,
  };
}
export function readyView(c: RunConfig = config, value: RevisionContent = content): RevisionView {
  const base = emptyView(c, value);
  const initial = planRevision(base, { config: c, content: value });
  if (!initial.ok) throw new Error(JSON.stringify(initial.fields));
  return {
    ...base,
    revision: {
      ...base.revision,
      config: initial.config,
      content: initial.content,
      fingerprints: initial.fingerprints,
    },
    outputs: Object.entries(initial.fingerprints).map(([key, fingerprint]) => ({
      recordId: `record-${key}`,
      publicationId: null,
      selected: true,
      available: true,
      slot: key,
      workKey: key,
      assetId: `asset-${key}`,
      fingerprint,
      state: "ready",
      output: {
        id: `output-${key}`,
        projectId: "p1",
        stageKind: key.startsWith("image:")
          ? "images"
          : key.startsWith("article:")
            ? "article"
            : "video",
        role: key.startsWith("image:")
          ? "image"
          : key.startsWith("article:")
            ? "article_md"
            : "video",
        path: `assets/${key}.bin`,
        originalFilename: null,
        bytes: 10,
        durationMs: 1000,
        meta: {},
        createdAt: "2026-09-10T00:00:00Z",
      },
    })),
  };
}
export function workFor(
  base: RevisionView,
  c: RunConfig = base.revision.config,
  value: RevisionContent = base.revision.content,
): RevisionWorkPlan {
  const next = planRevision(base, { config: c, content: value });
  if (!next.ok) throw new Error(JSON.stringify(next.fields));
  const revision = {
    ...base.revision,
    config: next.config,
    content: next.content,
    fingerprints: next.fingerprints,
  };
  return planRevisionWork(
    revision,
    next.manifest,
    catalogue,
    new Set([
      ...base.outputs.map((row) => row.assetId),
      ...Object.values(value.provided).filter((id): id is string => id !== undefined),
    ]),
    {
      articleMarkdown:
        next.content.articleEdited || c.sources.article === "provide"
          ? (next.content.articleMarkdown ?? c.provided.article ?? null)
          : base.articleMarkdown,
      researchNotes: null,
    },
  );
}
