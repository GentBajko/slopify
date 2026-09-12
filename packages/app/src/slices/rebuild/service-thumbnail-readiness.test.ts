import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { Catalogue } from "../../catalog/schema.js";
import { saveRevision } from "../revisions/mutations.js";
import { serviceFixture } from "./service.fake.js";
import { previewRebuild, type RebuildDeps, startRebuild } from "./service.js";

const catalogue: Catalogue = {
  schemaVersion: 1,
  updatedAt: "2026-09-12",
  providers: { codex: { maxConcurrent: 5 }, fal: { maxConcurrent: 5 } },
  llm: [
    {
      provider: "codex",
      id: "text",
      name: "Text",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: {},
      llm: { webSearch: false, thinking: {} },
    },
  ],
  tts: [],
  image: [
    {
      provider: "fal",
      id: "image",
      name: "Image",
      enabled: true,
      deprecated: false,
      source: "https://example.test",
      keywords: [],
      pricing: { perImage: 0.04 },
      image: { aspectRatios: ["16:9", "9:16"] },
    },
  ],
};

it.each(["missing-key", "unavailable-model", "disabled", "deprecated", "ready"] as const)(
  "checks deferred thumbnail image readiness before admitting prompt and image work (%s)",
  async (scenario) => {
    const h = await serviceFixture();
    try {
      h.setCatalogue({
        ...catalogue,
        image: catalogue.image.map((row) => ({
          ...row,
          enabled: scenario !== "disabled",
          deprecated: scenario === "deprecated",
        })),
      });
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "thumbnail",
        edit: {
          config: {
            ...h.config,
            sources: { ...h.config.sources, thumbnail: "prompt_by_llm" },
            llm: { provider: "codex", model: "text" },
            images: { provider: "fal", model: "image" },
            rendered: {
              ...h.config.rendered,
              thumbnailPrompt: "Write an image prompt about the article.",
            },
          },
          content: h.base.revision.content,
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const deps: RebuildDeps = {
        ...h.deps,
        providers: async () =>
          (await h.deps.providers()).map((row) =>
            row.family === "image" && scenario === "missing-key"
              ? { ...row, readiness: { kind: "keyed", hasKey: false } }
              : row,
          ),
        modelsFor: async (provider, family) =>
          family === "image" && scenario === "unavailable-model"
            ? []
            : h.deps.modelsFor(provider, family),
      };
      const preview = await previewRebuild(deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        request: { kind: "allAffected" },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      const result = await startRebuild(deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        previewId: preview.value.id,
        idempotencyKey: randomUUID(),
        acknowledgeUnknownCosts: true,
        confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
      });
      if (scenario === "ready") {
        expect(result.ok).toBe(true);
        expect(h.readinessCalls).toEqual(["providers", "codex:llm", "fal:image"]);
        expect(h.ticks).toEqual([h.projectId]);
        expect(
          h.deps.db
            .prepare(
              "SELECT p.work_key FROM revision_work w JOIN revision_work_pieces p ON p.work_id=w.id WHERE w.admission_id IS NOT NULL AND w.kind='thumbnail' AND w.dispatch_state='allowed' ORDER BY p.work_key",
            )
            .all(),
        ).toEqual([{ work_key: "thumbnail:image" }, { work_key: "thumbnail:prompt" }]);
      } else {
        expect(result).toEqual({
          ok: false,
          reason: "readiness",
          fields: [
            {
              field: scenario === "missing-key" ? "image" : "image.model",
              message:
                scenario === "missing-key"
                  ? "Configure this provider before rebuilding."
                  : scenario === "unavailable-model"
                    ? "Choose an available model before rebuilding."
                    : "The selected model is no longer available.",
            },
          ],
        });
        expect(h.ticks).toEqual([]);
        expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
      }
    } finally {
      h.close();
    }
  },
);

it.each(["price", "capabilities", "provider-limit", "unrelated"] as const)(
  "revalidates the deferred thumbnail catalogue snapshot at Start (%s)",
  async (change) => {
    const h = await serviceFixture();
    try {
      h.setCatalogue(catalogue);
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "thumbnail-catalogue",
        edit: {
          config: {
            ...h.config,
            sources: { ...h.config.sources, thumbnail: "prompt_by_llm" },
            llm: { provider: "codex", model: "text" },
            images: { provider: "fal", model: "image" },
            rendered: { ...h.config.rendered, thumbnailPrompt: "Describe the landscape." },
          },
          content: h.base.revision.content,
        },
      });
      if (!saved.ok) throw new Error(JSON.stringify(saved));
      const preview = await previewRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        request: { kind: "allAffected" },
      });
      if (!preview.ok) throw new Error(JSON.stringify(preview));
      h.setCatalogue({
        ...catalogue,
        updatedAt: "2026-09-13",
        providers: {
          ...catalogue.providers,
          ...(change === "provider-limit" ? { fal: { maxConcurrent: 2 } } : {}),
        },
        image:
          change === "unrelated"
            ? [
                ...catalogue.image,
                ...catalogue.image.map((row) => ({
                  ...row,
                  id: "unselected-image",
                  pricing: { perImage: 100 },
                })),
              ]
            : catalogue.image.map((row) => ({
                ...row,
                ...(change === "price" ? { pricing: { perImage: 100 } } : {}),
                ...(change === "capabilities" ? { image: { aspectRatios: ["16:9"] } } : {}),
              })),
      });
      const result = await startRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: saved.view.revision.id,
        previewId: preview.value.id,
        idempotencyKey: randomUUID(),
        acknowledgeUnknownCosts: true,
        confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
      });
      if (change === "unrelated") {
        expect(result.ok).toBe(true);
        expect(h.ticks).toEqual([h.projectId]);
      } else {
        expect(result).toEqual({ ok: false, reason: "stale-preview" });
        expect(h.ticks).toEqual([]);
        expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
      }
    } finally {
      h.close();
    }
  },
);
