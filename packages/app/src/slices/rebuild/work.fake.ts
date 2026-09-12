import type { WorkRef } from "../../kernel/runner/work.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { insertWorkPiece } from "./work-records.js";
export async function workFixture(): Promise<
  ReturnType<typeof revisionFixture> & {
    readonly work: WorkRef;
    readonly nextRevision: (id: string, fingerprints: Readonly<Record<string, string>>) => void;
  }
> {
  const h = revisionFixture();
  const db = h.deps.db;
  db.exec(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('s1','p1','images','generate','pending')",
  );
  const result = await ensureBaseline(h.deps, h.projectId);
  if (!result.ok) throw new Error("Expected baseline");
  const work: WorkRef = {
    projectId: h.projectId,
    revisionId: result.view.revision.id,
    workId: "w1",
    stageId: "s1",
    kind: "images",
    fingerprint: "group",
  };
  db.prepare(`UPDATE project_revisions SET fingerprints=? WHERE id=?`).run(
    JSON.stringify({ "image:i1": "old" }),
    work.revisionId,
  );
  db.prepare(
    `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES (?,?,?,?,?,?,'running','allowed','now')`,
  ).run(work.workId, work.projectId, work.revisionId, work.stageId, work.kind, work.fingerprint);
  insertWorkPiece(db, {
    id: "piece1",
    workId: work.workId,
    key: "image:i1",
    requestFingerprint: "request",
    fingerprint: "old",
    input: {
      kind: "image",
      version: 1,
      provider: "fake",
      model: "model",
      prompt: "Exact prompt",
      aspect: "16:9",
    },
    continuation: null,
    generationToken: "generation",
    state: "running",
    dispatchState: "allowed",
    submittedAt: null,
  });
  db.prepare(
    `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES (?,?,?,?,?,?)`,
  ).run(work.projectId, work.revisionId, "image:i1", work.workId, "piece1", "old");
  return {
    ...h,
    work,
    nextRevision: (id, fingerprints) => {
      db.prepare(
        `INSERT INTO project_revisions(id,project_id,parent_id,restored_from_id,config,content,fingerprints,created_at) SELECT ?,project_id,id,NULL,config,content,?,'later' FROM project_revisions WHERE id=?`,
      ).run(id, JSON.stringify(fingerprints), work.revisionId);
    },
  };
}
