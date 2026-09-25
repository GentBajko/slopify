import { afterEach, expect, it } from "vitest";
import type { RebuildPreview } from "./model.js";
import { previewById, recoverWork, storePreview } from "./repo.js";
import { workFixture } from "./work.fake.js";
import { insertWorkPiece, workPieces } from "./work-records.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await workFixture();
  cleanups.push(h.close);
  return h;
}
it("rejects cross-project revisions/stages and mismatched kinds in work rows", async () => {
  const { deps, work } = await fixture();
  const db = deps.db;
  db.exec(
    "INSERT INTO projects VALUES('p2','other','16:9','{}','now','now'); INSERT INTO stages(id,project_id,kind,source,state) VALUES('s2','p2','images','generate','pending')",
  );
  db.prepare(
    `INSERT INTO project_revisions(id,project_id,parent_id,restored_from_id,config,content,fingerprints,created_at) SELECT 'r2','p2',NULL,NULL,config,content,fingerprints,created_at FROM project_revisions WHERE id=?`,
  ).run(work.revisionId);
  const insert = db.prepare(
    `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES('bad',?,?,?,?,'fp','pending','held','now')`,
  );
  expect(() => insert.run("p2", work.revisionId, "s2", "images")).toThrow();
  expect(() => insert.run("p1", work.revisionId, "s2", "images")).toThrow();
  expect(() => insert.run("p1", work.revisionId, "s1", "audio")).toThrow();
  expect(() => insert.run("p1", work.revisionId, "s1", "images")).not.toThrow();
  db.exec("DELETE FROM projects WHERE id='p1'");
  expect(db.prepare("SELECT id FROM projects").all()).toEqual([{ id: "p2" }]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("rejects foreign-work pieces and foreign-project reservations", async () => {
  const { deps, work } = await fixture();
  const db = deps.db;
  db.prepare(
    `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) SELECT 'w2',project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at FROM revision_work WHERE id=?`,
  ).run(work.workId);
  expect(() =>
    db
      .prepare(
        `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES('p1',?,'foreign','w2','piece1','fp')`,
      )
      .run(work.revisionId),
  ).toThrow();
  expect(() =>
    db
      .prepare(
        `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES('p2',?,'foreign','w1','piece1','fp')`,
      )
      .run(work.revisionId),
  ).toThrow();
});
it("roundtrips strict immutable request inputs and refuses malformed stored input", async () => {
  const { deps, work } = await fixture();
  const piece = workPieces(deps.db, work.workId)[0];
  if (piece === undefined) throw new Error("Missing piece");
  const input = {
    kind: "llm" as const,
    version: 1 as const,
    provider: "fake",
    model: "model",
    thinking: "high" as const,
    thinkingConfig: { budget: 1234, level: "high" as const },
    messages: [{ role: "user" as const, content: "Exact request" }],
    webSearch: true,
  };
  insertWorkPiece(deps.db, { ...piece, id: "llm", key: "article", input });
  expect(workPieces(deps.db, work.workId)[1]?.input).toEqual(input);
  deps.db.exec(
    `UPDATE revision_work_pieces SET input_json='{"kind":"llm","version":1}' WHERE id='llm'`,
  );
  expect(() => workPieces(deps.db, work.workId)).toThrow();
});
it("scopes validated previews and admissions to the exact project/revision", async () => {
  const { deps, work, nextRevision } = await fixture();
  const preview: RebuildPreview = {
    id: "preview",
    projectId: "p1",
    baseRevisionId: work.revisionId,
    planFingerprint: "fp",
    selection: { kind: "allAffected" },
    changedInputs: [],
    work: [],
    retained: [],
    providedReuseRequired: [],
    costs: {
      currency: "USD",
      rows: [],
      low: 0,
      high: 0,
      unknown: 0,
      expectedWords: 0,
      catalogueDate: null,
      assumptions: [],
    },
    wholeRequestNotice: null,
    warnings: [],
  };
  storePreview(deps, preview);
  expect(previewById(deps.db, "p1", "preview")).toEqual(preview);
  expect(previewById(deps.db, "p2", "preview")).toBeUndefined();
  nextRevision("r-next", {});
  const insert = deps.db.prepare(
    `INSERT INTO rebuild_admissions(id,project_id,revision_id,idempotency_key,request_hash,preview_id,response_json,created_at) VALUES('a1',?,?,'key','hash','preview','{}','now')`,
  );
  expect(() => insert.run("p1", "r-next")).toThrow();
  expect(() => insert.run("p2", work.revisionId)).toThrow();
  expect(() => insert.run("p1", work.revisionId)).not.toThrow();
  deps.db.exec("DELETE FROM projects WHERE id='p1'");
  expect(deps.db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});
it("preserves queued batch admission policy while holding crash-interrupted active work", async () => {
  const { deps, work } = await fixture();
  deps.db.exec(
    "INSERT INTO batches VALUES('batch','now'); INSERT INTO project_queue(project_id,batch_id,state) VALUES('p1','batch','queued')",
  );
  recoverWork(deps.db);
  expect(workPieces(deps.db, work.workId)[0]?.dispatchState).toBe("allowed");
  deps.db.exec("UPDATE project_queue SET state='active'");
  recoverWork(deps.db);
  expect(workPieces(deps.db, work.workId)[0]?.dispatchState).toBe("held");
});
it("rejects a publication whose authority key or fingerprint differs from its durable piece", async () => {
  const { deps, work } = await fixture();
  const { publicationTargets } = await import("./repo.js");
  const publication = { work, pieceId: "piece1", publicationId: "piece1" };
  expect(() => publicationTargets(deps.db, publication, "image:foreign", "old")).toThrow(
    "a finished result doesn't match its saved step",
  );
  expect(() => publicationTargets(deps.db, publication, "image:i1", "foreign")).toThrow(
    "a finished result doesn't match its saved step",
  );
});
