import { expect, it } from "vitest";
import { workFixture } from "../../slices/rebuild/work.fake.js";
import { currentProjectEvent, currentWorkOrigin } from "./visibility.js";

it("keeps carried audio visible but rejects revoked pieces and old writing events", async () => {
  const h = await workFixture();
  try {
    const db = h.deps.db;
    const origin = { revisionId: h.work.revisionId, workId: h.work.workId, workPieceId: "piece1" };
    expect(currentWorkOrigin(db, h.projectId, origin)).toBe(true);
    h.nextRevision("r2", { "image:i1": "old" });
    db.prepare("UPDATE project_heads SET revision_id='r2' WHERE project_id=?").run(h.projectId);
    db.prepare(
      "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) SELECT project_id,'r2',work_key,work_id,piece_id,fingerprint FROM revision_work_reservations WHERE revision_id=?",
    ).run(h.work.revisionId);
    expect(currentWorkOrigin(db, h.projectId, origin)).toBe(true);
    expect(
      currentProjectEvent(db, {
        type: "article.delta",
        projectId: h.projectId,
        text: "old",
        ...origin,
      }),
    ).toBe(false);
    expect(
      currentProjectEvent(db, { type: "project.updated", projectId: h.projectId, ...origin }),
    ).toBe(true);
    db.exec("DELETE FROM revision_work_reservations WHERE revision_id='r2'");
    expect(currentWorkOrigin(db, h.projectId, origin)).toBe(false);
    expect(currentWorkOrigin(db, "other", origin)).toBe(false);
  } finally {
    h.close();
  }
});

it("requires exact current piece identity and hides unscoped legacy previews after adoption", async () => {
  const h = await workFixture();
  try {
    const db = h.deps.db;
    const origin = { revisionId: h.work.revisionId, workId: h.work.workId, workPieceId: "piece1" };
    expect(currentWorkOrigin(db, h.projectId, {})).toBe(false);
    expect(currentWorkOrigin(db, h.projectId, { ...origin, workPieceId: "not-owned" })).toBe(false);
    expect(
      currentProjectEvent(db, {
        type: "stage.progress",
        projectId: h.projectId,
        stage: "images",
        current: 1,
        total: 2,
        ...origin,
      }),
    ).toBe(true);
    db.exec("UPDATE revision_work_reservations SET fingerprint='wrong'");
    expect(currentWorkOrigin(db, h.projectId, origin)).toBe(false);
  } finally {
    h.close();
  }
});
