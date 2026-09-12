import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { expect, it } from "vitest";
import { sqliteAttempts } from "../../kernel/runner/attempt-repo.js";
import { claimWork, finishWork } from "../../kernel/runner/work-authority.js";
import { pauseProject } from "../control/index.js";
import { exportCatalogue, exportFixture } from "../rebuild/runtime-export.fake.js";
import { executionStages } from "../rebuild/runtime-store.js";
import { createRebuildDeps } from "../rebuild/service.fake.js";
import { previewRebuild, startRebuild } from "../rebuild/service.js";
import { workPieces } from "../rebuild/work-records.js";
import { saveRevision } from "../revisions/mutations.js";
import { deleteProject } from "./delete-project.js";
import { projectDir } from "./layout.js";

it("deletes admitted work, previews, attempts and review/control receipts through their foreign keys", async () => {
  const h = await exportFixture();
  try {
    const base = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: base.revision.id,
      idempotencyKey: "changed-transcript",
      edit: {
        config: {
          ...base.revision.config,
          sources: { ...base.revision.config.sources, images: "generate" },
          images: { provider: "fal", model: "image" },
        },
        content: {
          ...base.revision.content,
          articleMarkdown: "Revised transcript.",
          articleEdited: true,
          imageOrder: ["one"],
          imageDefinitions: { one: { source: "generate", prompt: "One", assetId: null } },
        },
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const { deps } = createRebuildDeps(h.deps, {
      ...exportCatalogue,
      providers: { fal: { maxConcurrent: 5 } },
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
    });
    const preview = await previewRebuild(deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      request: { kind: "selected", workKeys: ["subtitles:cues", "image:one"] },
    });
    if (!preview.ok) throw new Error(JSON.stringify(preview));
    const admitted = await startRebuild(deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      previewId: preview.value.id,
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: preview.value.providedReuseRequired,
    });
    if (!admitted.ok) throw new Error(JSON.stringify(admitted));
    const image = executionStages(deps, h.projectId).find((stage) => stage.kind === "images");
    if (image === undefined) throw new Error("Expected admitted image work");
    const piece = workPieces(deps.db, image.work.workId)[0];
    if (piece === undefined) throw new Error("Expected image request piece");
    expect(claimWork(deps.db, image.work)).toBe(true);
    const attempts = sqliteAttempts(deps.db, deps.ids);
    const attempt = attempts.start({
      work: image.work,
      workPieceId: piece.id,
      stageId: image.id,
      pieceId: null,
      n: 1,
      startedAt: deps.clock.now().toISOString(),
    });
    if (typeof attempt === "string" || !attempt.ok) throw new Error("Expected revision attempt");
    attempts.end(attempt.value, {
      outcome: "canceled",
      endedAt: deps.clock.now().toISOString(),
      errorText: null,
    });
    finishWork(deps.db, image.work, "failed", "Canceled");
    expect(
      await pauseProject(deps, h.projectId, {
        baseRevisionId: saved.view.revision.id,
        idempotencyKey: randomUUID(),
      }),
    ).toEqual({ ok: true });
    const tables = [
      "project_revisions",
      "project_assets",
      "revision_work",
      "revision_work_pieces",
      "revision_work_reservations",
      "rebuild_previews",
      "rebuild_admissions",
      "attempts",
      "project_control_receipts",
      "revision_provided_reviews",
    ];
    for (const table of tables)
      expect(deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()?.n).toBeGreaterThan(0);
    expect(deleteProject(deps, h.projectId)).toEqual({ ok: true });
    expect(existsSync(projectDir(deps.paths, h.projectId))).toBe(false);
    for (const table of tables)
      expect(deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    expect(deps.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  } finally {
    h.close();
  }
});
