import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { imageFixture } from "../revisions/mutation.fake.js";
import { saveRevision } from "../revisions/mutations.js";
import type { RebuildPreview } from "./model.js";
import { createRebuildDeps, serviceFixture } from "./service.fake.js";
import { previewRebuild, rebuildConfirmations, startRebuild } from "./service.js";

const startInput = (preview: RebuildPreview, key = randomUUID()) => ({
  projectId: preview.projectId,
  baseRevisionId: preview.baseRevisionId,
  previewId: preview.id,
  idempotencyKey: key,
  acknowledgeUnknownCosts: true,
  confirmedProvidedWorkKeys: preview.providedReuseRequired,
});
describe("explicit rebuild admission", () => {
  it("requires precisely reviewed content and unknown cost acknowledgement", () => {
    expect(rebuildConfirmations(["audio:provided"], [], 0, false)).toBe("review-required");
    expect(rebuildConfirmations(["audio:provided"], ["audio:provided", "other"], 0, true)).toBe(
      "review-required",
    );
    expect(rebuildConfirmations(["audio:provided"], ["audio:provided"], 1, false)).toBe(
      "cost-ack-required",
    );
    expect(rebuildConfirmations(["audio:provided"], ["audio:provided"], 1, true)).toBeUndefined();
  });
  it("previews without dispatch, admits once, joins reservations and replays after a save", async () => {
    const h = await serviceFixture();
    try {
      const p = await previewRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        request: { kind: "allAffected" },
      });
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(h.ticks).toEqual([]);
      expect(h.readinessCalls).toEqual([]);
      const input = startInput(p.value);
      const [a, b] = await Promise.all([startRebuild(h.deps, input), startRebuild(h.deps, input)]);
      if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
      expect(a.value.admissionId).toBe(b.value.admissionId);
      expect(a.value.workIds).toEqual(b.value.workIds);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
      const saved = await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        idempotencyKey: "later",
        edit: { config: { ...h.config, title: "Later" }, content: h.base.revision.content },
      });
      expect(saved.ok).toBe(true);
      expect(await startRebuild(h.deps, input)).toEqual({
        ok: true,
        value: { ...a.value, replayed: true },
      });
      expect(await startRebuild(h.deps, { ...input, acknowledgeUnknownCosts: false })).toEqual({
        ok: false,
        reason: "conflict",
      });
    } finally {
      h.close();
    }
  });
  it("rejects duplicate and unknown targets with no grants", async () => {
    const h = await serviceFixture();
    try {
      for (const workKeys of [["missing"], ["article:body", "article:body"]]) {
        const result = await previewRebuild(h.deps, {
          projectId: h.projectId,
          baseRevisionId: h.base.revision.id,
          request: { kind: "selected", workKeys },
        });
        expect(result).toMatchObject({ ok: false, reason: "invalid-selection" });
      }
      expect(h.ticks).toEqual([]);
    } finally {
      h.close();
    }
  });
  it("requires cost acknowledgement before readiness and grants", async () => {
    const base = await imageFixture();
    const h = { ...base, ...createRebuildDeps(base.deps) };
    try {
      const p = await previewRebuild(h.deps, {
        projectId: h.projectId,
        baseRevisionId: h.base.revision.id,
        request: { kind: "selected", workKeys: ["image:first"] },
      });
      if (!p.ok) throw new Error(JSON.stringify(p));
      expect(p.value.work.map((row) => row.key)).toEqual(["image:first"]);
      expect(p.value.costs.unknown).toBe(1);
      expect(
        await startRebuild(h.deps, { ...startInput(p.value), acknowledgeUnknownCosts: false }),
      ).toEqual({ ok: false, reason: "cost-ack-required" });
      expect(h.readinessCalls).toEqual([]);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    } finally {
      h.close();
    }
  });
});
it("saving, restoring, and previewing never dispatch or probe providers", async () => {
  const h = await serviceFixture();
  try {
    const { restoreRevision } = await import("../revisions/restore.js");
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "saved",
      edit: { config: { ...h.config, title: "Saved edit" }, content: h.base.revision.content },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const restored = await restoreRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: saved.view.revision.id,
      idempotencyKey: "restore",
      targetRevisionId: h.base.revision.id,
    });
    if (!restored.ok) throw new Error(JSON.stringify(restored));
    expect(
      (
        await previewRebuild(h.deps, {
          projectId: h.projectId,
          baseRevisionId: restored.view.revision.id,
          request: { kind: "allAffected" },
        })
      ).ok,
    ).toBe(true);
    expect(h.ticks).toEqual([]);
    expect(h.readinessCalls).toEqual([]);
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(0);
  } finally {
    h.close();
  }
});
