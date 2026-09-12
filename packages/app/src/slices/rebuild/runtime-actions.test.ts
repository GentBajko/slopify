import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import type { CatalogueStore } from "../../catalog/store.js";
import { saveRevision } from "../revisions/mutations.js";
import { currentRevisionId } from "../revisions/repo.js";
import { getRevisionView } from "../revisions/view.js";
import { outputPath } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { revisionAction } from "./runtime-actions.js";
import { exportCatalogue, exportFixture } from "./runtime-export.fake.js";

function catalogue() {
  const read = vi.fn(() => exportCatalogue);
  const store: CatalogueStore = {
    read,
    models: () => [],
    refresh: async () => undefined,
    status: () => ({
      updatedAt: "2026-09-12",
      path: "unused",
      warning: null,
      source: "https://example.test",
    }),
  };
  return { read, store };
}
it("removes the last image as a saved edit, keeps old media, and switches to audio export", async () => {
  const h = await exportFixture();
  try {
    const base = h.view();
    writeFileSync(join(h.deps.paths.staging, "image"), "image");
    insertStagedFile(h.deps.db, {
      id: "image",
      stageKind: "images",
      path: "image",
      originalFilename: "image.png",
      bytes: 5,
      state: "staged",
      createdAt: h.deps.clock.now().toISOString(),
    });
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "slideshow",
      edit: {
        config: {
          ...base.revision.config,
          sources: { ...base.revision.config.sources, images: "provide", video: "generate" },
          subtitles: {
            mode: "burn-in",
            language: "en",
            fontId: "default",
            fontSize: 48,
            position: "bottom",
          },
        },
        content: {
          ...base.revision.content,
          imageOrder: ["one"],
          imageDefinitions: { one: { source: "provide", assetId: null, prompt: null } },
        },
        uploads: [{ stagedFileId: "image", destination: { kind: "image", imageKey: "one" } }],
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const image = saved.view.outputs.find((row) => row.selected && row.output.role === "image");
    if (image === undefined) throw new Error("Missing image");
    const catalog = catalogue();
    const result = await revisionAction({ ...h.deps, catalogue: catalog.store }, h.projectId, {
      kind: "delete-image",
      outputId: image.output.id,
    });
    expect(result).toEqual({ ok: true, redone: [] });
    const head = currentRevisionId(h.deps.db, h.projectId);
    if (head === undefined) throw new Error("Missing head");
    const next = getRevisionView(h.deps, h.projectId, head);
    expect(next?.revision.config).toMatchObject({
      sources: { images: "off", video: "off", audio: "provide" },
      subtitles: { mode: "files" },
    });
    expect(next?.revision.content.imageOrder).toEqual([]);
    expect(existsSync(outputPath(h.deps.paths, h.projectId, image.output.path))).toBe(true);
    expect(
      h
        .view(saved.view.revision.id)
        .outputs.some((row) => row.assetId === image.assetId && row.available),
    ).toBe(true);
    expect(catalog.read).not.toHaveBeenCalled();
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(0);
  } finally {
    h.close();
  }
});
it("saves article edits without reading the catalogue or admitting generation", async () => {
  const h = await exportFixture(false);
  try {
    const catalog = catalogue();
    expect(
      await revisionAction({ ...h.deps, catalogue: catalog.store }, h.projectId, {
        kind: "article",
        markdown: "A new article.",
      }),
    ).toEqual({ ok: true, redone: [] });
    const head = currentRevisionId(h.deps.db, h.projectId);
    if (head === undefined) throw new Error("Missing head");
    expect(getRevisionView(h.deps, h.projectId, head)?.articleMarkdown).toBe("A new article.");
    expect(h.view().articleMarkdown?.trim()).toBe("Saved article.");
    expect(catalog.read).not.toHaveBeenCalled();
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(0);
  } finally {
    h.close();
  }
});
it("requires a reviewed rebuild for retry and saves regeneration without granting work", async () => {
  const h = await exportFixture(false);
  try {
    const catalog = catalogue();
    expect(
      await revisionAction({ ...h.deps, catalogue: catalog.store }, h.projectId, {
        kind: "retry",
        stage: "audio",
      }),
    ).toEqual({ ok: false, reason: "rebuild-required" });
    expect(
      await revisionAction({ ...h.deps, catalogue: catalog.store }, h.projectId, {
        kind: "rerun",
        stage: "audio",
      }),
    ).toEqual({ ok: true, redone: [] });
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(0);
    expect(catalog.read).not.toHaveBeenCalled();
  } finally {
    h.close();
  }
});
