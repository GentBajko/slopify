import { expect, it } from "vitest";
import { ensureBaseline } from "./adopt.js";
import { saveRevision } from "./mutations.js";
import { listRevisionHistory, revisionById } from "./repo.js";
import { revisionFixture } from "./revision.fake.js";

it("saves once, synchronizes title columns, and never rewrites the baseline", async () => {
  const h = revisionFixture();
  try {
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    const input = {
      projectId: h.projectId,
      baseRevisionId: baseline.view.revision.id,
      idempotencyKey: "save-title",
      edit: {
        config: { ...baseline.view.revision.config, title: "Revised" },
        content: baseline.view.revision.content,
      },
    };
    const first = await saveRevision(h.deps, input);
    const duplicate = await saveRevision(h.deps, input);
    expect(first.ok).toBe(true);
    expect(duplicate.ok && duplicate.duplicate).toBe(true);
    expect(h.deps.db.prepare("SELECT title FROM projects WHERE id = ?").get(h.projectId)).toEqual({
      title: "Revised",
    });
    expect(revisionById(h.deps.db, h.projectId, baseline.view.revision.id)?.config.title).toBe(
      "Saved",
    );
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(2);
  } finally {
    h.close();
  }
});

it("refuses stale bases and key collisions without writes, and replays older receipts", async () => {
  const h = revisionFixture();
  try {
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    const request = {
      projectId: h.projectId,
      baseRevisionId: baseline.view.revision.id,
      idempotencyKey: "first",
      edit: {
        config: { ...h.config, title: "First", format: "9:16" as const },
        content: baseline.view.revision.content,
      },
    };
    const first = await saveRevision(h.deps, request);
    if (!first.ok) throw new Error(JSON.stringify(first));
    expect(h.deps.db.prepare("SELECT title,format FROM projects").get()).toEqual({
      title: "First",
      format: "9:16",
    });
    const count = listRevisionHistory(h.deps.db, h.projectId).length;
    expect(await saveRevision(h.deps, { ...request, idempotencyKey: "stale" })).toMatchObject({
      ok: false,
      reason: "conflict",
    });
    expect(
      await saveRevision(h.deps, {
        ...request,
        edit: { ...request.edit, config: { ...request.edit.config, title: "Different" } },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(count);
    expect(
      await saveRevision(h.deps, {
        ...request,
        idempotencyKey: "second",
        baseRevisionId: first.view.revision.id,
        edit: { ...request.edit, config: { ...request.edit.config, title: "Second" } },
      }),
    ).toMatchObject({ ok: true });
    const replay = await saveRevision(h.deps, request);
    expect(replay).toMatchObject({
      ok: true,
      duplicate: true,
      view: { current: false, revision: { id: first.view.revision.id } },
    });
  } finally {
    h.close();
  }
});

it("rolls back revision, head, configuration, manifests and receipt when projection fails", async () => {
  const h = revisionFixture();
  try {
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    h.deps.db.exec(
      "CREATE TRIGGER reject_output BEFORE INSERT ON outputs BEGIN SELECT RAISE(ABORT,'projection refused'); END",
    );
    await expect(
      saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        idempotencyKey: "failure",
        edit: {
          config: { ...h.config, title: "Rejected" },
          content: baseline.view.revision.content,
        },
      }),
    ).rejects.toThrow("projection refused");
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
    expect(h.deps.db.prepare("SELECT title FROM projects").get()).toEqual({ title: "Saved" });
    for (const table of [
      "project_assets",
      "revision_outputs",
      "revision_mutations",
      "revision_work",
    ])
      expect(h.deps.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
  } finally {
    h.close();
  }
});

it("rejects rebuild-owned idempotency keys across the shared namespace", async () => {
  const h = revisionFixture();
  try {
    const baseline = await ensureBaseline(h.deps, h.projectId);
    if (!baseline.ok) throw new Error("Expected baseline.");
    h.deps.db
      .prepare(
        "INSERT INTO rebuild_previews(id,project_id,revision_id,plan_fingerprint,body_json,created_at) VALUES ('preview',?,?,'fp','{}','now')",
      )
      .run(h.projectId, baseline.view.revision.id);
    h.deps.db
      .prepare(
        "INSERT INTO rebuild_admissions(id,project_id,revision_id,preview_id,idempotency_key,request_hash,response_json,created_at) VALUES ('admission',?,?,'preview','shared','request','{}','now')",
      )
      .run(h.projectId, baseline.view.revision.id);
    expect(
      await saveRevision(h.deps, {
        projectId: h.projectId,
        baseRevisionId: baseline.view.revision.id,
        idempotencyKey: "shared",
        edit: { config: h.config, content: baseline.view.revision.content },
      }),
    ).toMatchObject({ ok: false, reason: "idempotency-conflict" });
    expect(listRevisionHistory(h.deps.db, h.projectId)).toHaveLength(1);
  } finally {
    h.close();
  }
});
