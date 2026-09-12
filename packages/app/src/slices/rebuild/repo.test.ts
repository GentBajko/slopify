import { afterEach, expect, it } from "vitest";
import type { WorkRef } from "../../kernel/runner/work.js";
import { ensureBaseline } from "../revisions/adopt.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { claimWork, maySubmit, publicationTargets, recoverWork } from "./repo.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = revisionFixture();
  cleanups.push(h.close);
  const db = h.deps.db;
  db.exec(
    "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s1','p1','images','generate','pending')",
  );
  const baseline = await ensureBaseline(h.deps, h.projectId);
  if (!baseline.ok) throw new Error("Expected baseline");
  const work: WorkRef = {
    projectId: h.projectId,
    revisionId: baseline.view.revision.id,
    workId: "w1",
    stageId: "s1",
    kind: "images",
    fingerprint: "old",
  };
  db.prepare(
    `INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES (?,?,?,?,?,?,'pending','held','now')`,
  ).run(work.workId, work.projectId, work.revisionId, work.stageId, work.kind, work.fingerprint);
  db.prepare("UPDATE project_revisions SET fingerprints=? WHERE id=?").run(
    JSON.stringify({ "image:i1": "old" }),
    work.revisionId,
  );
  return { ...h, db, work };
}
it("requires explicit permission and the complete identity for a single claim", async () => {
  const { db, work } = await fixture();
  expect(claimWork(db, work)).toBe(false);
  expect(maySubmit(db, work)).toBe(false);
  db.exec("UPDATE revision_work SET dispatch_state='allowed'");
  for (const wrong of [
    { revisionId: "bad" },
    { fingerprint: "bad" },
    { stageId: "bad" },
    { kind: "audio" as const },
    { projectId: "bad" },
  ])
    expect(claimWork(db, { ...work, ...wrong })).toBe(false);
  expect(claimWork(db, work)).toBe(true);
  expect(claimWork(db, work)).toBe(false);
});
it("requires a matching current reservation before attaching a late image", async () => {
  const { db, work } = await fixture();
  db.exec("UPDATE revision_work SET state='running',dispatch_state='draining'");
  db.prepare(
    `INSERT INTO project_revisions(id,project_id,parent_id,restored_from_id,config,content,fingerprints,created_at) SELECT 'current-r',project_id,id,NULL,config,content,fingerprints,'later' FROM project_revisions WHERE id=?`,
  ).run(work.revisionId);
  db.exec("UPDATE project_heads SET revision_id='current-r'");
  const publication = { work, pieceId: null, publicationId: work.workId };
  const historical = [{ revisionId: work.revisionId, current: false, selected: false }];
  expect(publicationTargets(db, publication, "image:i1", "old")).toEqual(historical);
  db.exec(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES ('p1','current-r','image:i1','w1',NULL,'old')",
  );
  expect(publicationTargets(db, publication, "image:i1", "old")).toContainEqual({
    revisionId: "current-r",
    current: true,
    selected: true,
  });
  db.exec("UPDATE project_revisions SET fingerprints='{}' WHERE id='current-r'");
  expect(publicationTargets(db, publication, "image:i1", "old")).toEqual(historical);
  expect(
    publicationTargets(
      db,
      { ...publication, work: { ...work, workId: "invented" }, publicationId: "invented" },
      "image:i1",
      "old",
    ),
  ).toEqual([]);
  db.exec("DELETE FROM projects WHERE id='p1'");
  expect(publicationTargets(db, publication, "image:i1", "old")).toEqual([]);
});
it("holds unfinished work on recovery without modifying completed pieces or continuation tokens", async () => {
  const { db, work } = await fixture();
  db.exec("UPDATE revision_work SET state='running',dispatch_state='allowed'");
  for (const [id, state] of [
    ["p1", "done"],
    ["p2", "running"],
    ["p3", "pending"],
  ] as const)
    db.prepare(
      `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,continuation,generation_token,state,dispatch_state) VALUES (?,? ,?,'req','fp',?,'token','generation',?,'allowed')`,
    ).run(
      id,
      work.workId,
      id,
      JSON.stringify({ kind: "local", version: 1, operation: "concat", values: [] }),
      state,
    );
  recoverWork(db);
  expect(maySubmit(db, work, "p2")).toBe(false);
  expect(
    db
      .prepare(
        "SELECT state,dispatch_state,continuation,generation_token FROM revision_work_pieces ORDER BY id",
      )
      .all(),
  ).toEqual([
    {
      state: "done",
      dispatch_state: "allowed",
      continuation: "token",
      generation_token: "generation",
    },
    {
      state: "held",
      dispatch_state: "held",
      continuation: "token",
      generation_token: "generation",
    },
    {
      state: "held",
      dispatch_state: "held",
      continuation: "token",
      generation_token: "generation",
    },
  ]);
});
