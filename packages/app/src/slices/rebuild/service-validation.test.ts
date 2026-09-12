import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import { expect, it } from "vitest";
import { outputPath } from "../storage/layout.js";
import type { RebuildPreview } from "./model.js";
import { exportFixture } from "./runtime-export.fake.js";
import { createRebuildDeps, paidServiceFixture } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

const start = (preview: RebuildPreview) => ({
  projectId: preview.projectId,
  baseRevisionId: preview.baseRevisionId,
  previewId: preview.id,
  idempotencyKey: randomUUID(),
  acknowledgeUnknownCosts: true,
  confirmedProvidedWorkKeys: preview.providedReuseRequired,
});
it("rejects vanished supplied audio before granting local export", async () => {
  const h = await exportFixture(false);
  try {
    const helper = createRebuildDeps(h.deps);
    const view = h.view();
    const request = {
      projectId: h.projectId,
      baseRevisionId: view.revision.id,
      request: { kind: "selected" as const, workKeys: ["export:wav"] },
    };
    const p = await previewRebuild(helper.deps, request);
    if (!p.ok) throw new Error(JSON.stringify(p));
    const audio = view.outputs.find((row) => row.output.role === "audio_body");
    if (audio === undefined) throw new Error("No audio");
    unlinkSync(outputPath(h.deps.paths, h.projectId, audio.output.path));
    expect(await startRebuild(helper.deps, start(p.value))).toEqual({
      ok: false,
      reason: "stale-preview",
    });
    expect(await previewRebuild(helper.deps, request)).toMatchObject({
      ok: false,
      reason: "invalid-selection",
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
it("returns typed readiness failure without grants and rejects a colliding save key", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    expect(
      await startRebuild(
        {
          ...h.deps,
          providers: async () => {
            throw new Error("Unavailable");
          },
        },
        start(p.value),
      ),
    ).toEqual({ ok: false, reason: "readiness" });
    const key = randomUUID();
    h.deps.db
      .prepare(
        "INSERT INTO revision_mutations(project_id,idempotency_key,operation,request_hash,base_revision_id,result_revision_id,created_at) VALUES (?,?,'save','other',?,?,?)",
      )
      .run(
        h.projectId,
        key,
        h.base.revision.id,
        h.base.revision.id,
        h.deps.clock.now().toISOString(),
      );
    expect(await startRebuild(h.deps, { ...start(p.value), idempotencyKey: key })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(h.ticks).toEqual([]);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
it("rejects a required model changed while readiness was loading", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    const deps = {
      ...h.deps,
      modelsFor: async () => {
        h.setCatalogue({
          ...h.catalogue,
          image: h.catalogue.image.map((row) => ({ ...row, deprecated: true })),
        });
        return [{ id: "image", name: "Image" }];
      },
    };
    expect(await startRebuild(deps, start(p.value))).toEqual({
      ok: false,
      reason: "stale-preview",
    });
    expect(h.ticks).toEqual([]);
  } finally {
    h.close();
  }
});
it("rejects a CLI command changed during model readiness", async () => {
  const h = await paidServiceFixture();
  try {
    const { saveRevision } = await import("../revisions/mutations.js");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "cli",
      edit: {
        config: {
          ...h.base.revision.config,
          sources: { ...h.base.revision.config.sources, article: "generate" },
          llm: { provider: "codex", model: "text" },
          provided: {},
          rendered: { article: "Write text." },
        },
        content: { ...h.base.revision.content, articleMarkdown: undefined, articleEdited: false },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    h.setCatalogue({
      ...h.catalogue,
      providers: { ...h.catalogue.providers, codex: { maxConcurrent: 5 } },
      llm: [
        {
          provider: "codex",
          id: "text",
          name: "Text",
          source: "https://example.test",
          keywords: [],
          enabled: true,
          deprecated: false,
          pricing: {},
          llm: { webSearch: false, thinking: {} },
        },
      ],
    });
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "selected", workKeys: ["article:body"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    const result = await startRebuild(
      {
        ...h.deps,
        providers: async () => [
          {
            id: "codex",
            family: "llm",
            displayName: "Codex",
            readiness: { kind: "cli", installed: true },
            cliPath: { configured: null, command: "previous-command" },
          },
        ],
        modelsFor: async () => [{ id: "text", name: "Text" }],
      },
      start(p.value),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "readiness",
      fields: expect.arrayContaining([expect.objectContaining({ field: "llm.cliPath" })]),
    });
  } finally {
    h.close();
  }
});
