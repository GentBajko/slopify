import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import type { RebuildPreview } from "./model.js";
import { paidServiceFixture } from "./service.fake.js";
import { previewRebuild, startRebuild } from "./service.js";

const input = (p: RebuildPreview) => ({
  projectId: p.projectId,
  baseRevisionId: p.baseRevisionId,
  previewId: p.id,
  idempotencyKey: randomUUID(),
  acknowledgeUnknownCosts: true,
  confirmedProvidedWorkKeys: [],
});
it("admits a selected paid request once and joins it under another key", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    expect(p.value.costs.low).toBe(0.04);
    expect(p.value.costs.catalogueDate).toBe(h.catalogue.updatedAt);
    expect(p.value.work.every((row) => !("input" in row))).toBe(true);
    expect(p.value.work.map((row) => row.key)).toEqual(["image:one"]);
    const body = input(p.value);
    const [a, b] = await Promise.all([startRebuild(h.deps, body), startRebuild(h.deps, body)]);
    if (!a.ok || !b.ok) throw new Error(JSON.stringify([a, b]));
    expect(a.value.workIds).toEqual(b.value.workIds);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(1);
    const c = await startRebuild(h.deps, input(p.value));
    if (!c.ok) throw new Error(JSON.stringify(c));
    expect(c.value.workIds).toEqual(a.value.workIds);
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM revision_work WHERE dispatch_state='allowed'")
        .get()?.n,
    ).toBe(1);
    expect(
      h.deps.db
        .prepare("SELECT admission_id FROM revision_work WHERE id=?")
        .get(a.value.workIds[0] ?? "")?.admission_id,
    ).toBe(a.value.admissionId);
  } finally {
    h.close();
  }
});
it("does not hold the project lock during readiness and rejects a newer saved revision", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached: () => void = () => undefined;
    const entered = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const starting = startRebuild(
      {
        ...h.deps,
        providers: async () => {
          reached();
          await gate;
          return h.deps.providers();
        },
      },
      input(p.value),
    );
    await entered;
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      idempotencyKey: "during-readiness",
      edit: {
        config: { ...h.base.revision.config, title: "Later" },
        content: h.base.revision.content,
      },
    });
    expect(saved.ok).toBe(true);
    release();
    expect(await starting).toEqual({ ok: false, reason: "conflict" });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM rebuild_admissions").get()?.n).toBe(0);
    expect(h.ticks).toEqual([]);
  } finally {
    h.close();
  }
});
it("invalidates selected prices but ignores unrelated catalogue changes", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    h.setCatalogue({ ...h.catalogue, updatedAt: "2026-09-13" });
    expect((await startRebuild(h.deps, input(p.value))).ok).toBe(true);
    const p2 = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:two"] },
    });
    if (!p2.ok) throw new Error(JSON.stringify(p2));
    h.setCatalogue({
      ...h.catalogue,
      image: h.catalogue.image.map((row) => ({ ...row, pricing: { perImage: 0.08 } })),
    });
    expect(await startRebuild(h.deps, input(p2.value))).toEqual({
      ok: false,
      reason: "stale-preview",
    });
  } finally {
    h.close();
  }
});
it("retains the receipt if notifying the runner fails", async () => {
  const h = await paidServiceFixture();
  try {
    const p = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: h.base.revision.id,
      request: { kind: "selected", workKeys: ["image:one"] },
    });
    if (!p.ok) throw new Error(JSON.stringify(p));
    const body = input(p.value);
    const first = await startRebuild(
      {
        ...h.deps,
        runner: {
          ...h.deps.runner,
          tick: () => {
            throw new Error("offline");
          },
        },
      },
      body,
    );
    if (!first.ok) throw new Error(JSON.stringify(first));
    expect(await startRebuild(h.deps, body)).toEqual({
      ok: true,
      value: { ...first.value, replayed: true },
    });
    expect(h.ticks).toEqual([h.projectId]);
  } finally {
    h.close();
  }
});
