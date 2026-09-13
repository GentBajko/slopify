import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import {
  approveCheckpoint,
  checkpointForWork,
  listCheckpoints,
  saveCheckpointSet,
  settleCheckpointClosures,
} from "./index.js";

const at = "2026-09-13T12:00:00.000Z";
const fingerprint = "a".repeat(64);
const roots: string[] = [];
const databases = new Set<ReturnType<typeof openDb>>();
afterEach(() => {
  for (const db of databases) db.close();
  databases.clear();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "slopify-checkpoints-"));
  roots.push(root);
  const path = join(root, "app.db");
  const db = openDb(path);
  databases.add(db);
  migrate(db, fixedClock(at));
  db.exec("INSERT INTO projects VALUES ('p','Test','16:9','{}','old','old')");
  for (const revision of ["r1", "r2"])
    db.prepare(
      "INSERT INTO project_revisions VALUES (?, 'p', NULL, NULL, '{}', '{}', '{}', ?)",
    ).run(revision, at);
  db.exec("INSERT INTO project_heads VALUES ('p','r1')");
  for (const stage of ["audio", "images", "video"])
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?, 'p', ?, 'generate','pending')",
    ).run(stage, stage);
  for (const revision of ["r1", "r2"])
    for (const stage of ["audio", "images", "video"])
      db.prepare(
        "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES (?, 'p', ?, ?, ?, ?, 'pending','allowed', ?)",
      ).run(`${revision}-${stage}`, revision, stage, stage, fingerprint, at);
  return { db, path };
}
const gates = [
  { checkpointId: "audio-gate", stage: "audio", workId: "r1-audio", fingerprint, state: "held" },
  { checkpointId: "images-gate", stage: "images", workId: "r1-images", fingerprint, state: "held" },
] as const;
const setup = { projectId: "p", revisionId: "r1", checkpoints: gates, createdAt: at };
const approval = {
  projectId: "p",
  revisionId: "r1",
  checkpointId: "audio-gate",
  fingerprint,
  idempotencyKey: "11111111-1111-4111-8111-111111111111",
  approvedAt: at,
};

it("persists two unique gates and their exact approval fingerprint across reopen", () => {
  const { db, path } = fixture();
  expect(saveCheckpointSet(db, setup).ok).toBe(true);
  expect(saveCheckpointSet(db, setup)).toMatchObject({ ok: false, reason: "duplicate" });
  expect(listCheckpoints(db, "p", "r1")).toHaveLength(2);
  expect(() =>
    db.exec("INSERT INTO review_checkpoints SELECT * FROM review_checkpoints LIMIT 1"),
  ).toThrow();
  expect(approveCheckpoint(db, approval)).toMatchObject({
    ok: true,
    value: { state: "released", fingerprint },
  });
  expect(db.prepare("SELECT fingerprint FROM review_checkpoint_approvals").all()).toEqual([
    { fingerprint },
  ]);
  db.close();
  databases.delete(db);
  const reopened = openDb(path);
  databases.add(reopened);
  expect(listCheckpoints(reopened, "p", "r1").map((row) => row.state)).toEqual([
    "released",
    "held",
  ]);
  expect(approveCheckpoint(reopened, approval)).toMatchObject({
    ok: false,
    reason: "duplicate",
    value: { state: "released" },
  });
  expect(checkpointForWork(reopened, "r1-video")).toHaveLength(2);
  expect(checkpointForWork(reopened, "r2-video")).toEqual([]);
  expect(checkpointForWork(reopened, "missing")).toEqual([]);
});

it("refuses mismatched approvals and identity reuse without changing stored gates", () => {
  const { db } = fixture();
  saveCheckpointSet(db, setup);
  expect(approveCheckpoint(db, { ...approval, fingerprint: "b".repeat(64) })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(approveCheckpoint(db, { ...approval, checkpointId: "missing" })).toEqual({
    ok: false,
    reason: "not-found",
  });
  expect(approveCheckpoint(db, { ...approval, projectId: "missing" })).toEqual({
    ok: false,
    reason: "not-found",
  });
  expect(approveCheckpoint(db, approval).ok).toBe(true);
  expect(approveCheckpoint(db, { ...approval, checkpointId: "images-gate" })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(approveCheckpoint(db, { ...approval, fingerprint: "b".repeat(64) })).toEqual({
    ok: false,
    reason: "conflict",
  });
  expect(db.prepare("SELECT count(*) AS n FROM review_checkpoint_approvals").get()).toEqual({
    n: 1,
  });
  expect(listCheckpoints(db, "p", "r1")[1]?.state).toBe("held");
});

it("rejects foreign revision/work identities and duplicate gate IDs before writing", () => {
  const { db } = fixture();
  expect(saveCheckpointSet(db, { ...setup, revisionId: "missing" })).toEqual({
    ok: false,
    reason: "not-found",
  });
  expect(saveCheckpointSet(db, { ...setup, checkpoints: [gates[0], gates[0]] })).toEqual({
    ok: false,
    reason: "duplicate",
  });
  expect(
    saveCheckpointSet(db, {
      ...setup,
      checkpoints: [gates[0], { ...gates[1], workId: "r2-images" }],
    }),
  ).toEqual({ ok: false, reason: "conflict" });
  expect(
    saveCheckpointSet(db, { ...setup, checkpoints: [{ ...gates[0], workId: "missing" }] }),
  ).toEqual({ ok: false, reason: "not-found" });
  expect(
    saveCheckpointSet(db, { ...setup, checkpoints: [{ ...gates[0], workId: "r1-images" }] }),
  ).toEqual({ ok: false, reason: "conflict" });
  expect(listCheckpoints(db, "p", "r1")).toEqual([]);
});

it("keeps released identities immutable and rejects a stale revision approval", () => {
  const { db } = fixture();
  saveCheckpointSet(db, setup);
  expect(
    saveCheckpointSet(db, {
      ...setup,
      checkpoints: [{ ...gates[0], fingerprint: "b".repeat(64) }],
    }),
  ).toEqual({ ok: false, reason: "conflict" });
  db.exec("UPDATE project_heads SET revision_id='r2' WHERE project_id='p'");
  expect(approveCheckpoint(db, approval)).toEqual({ ok: false, reason: "conflict" });
  expect(listCheckpoints(db, "p", "r1")[0]?.state).toBe("held");
});

it("rolls back approval if receipt persistence fails and cascades project deletion", () => {
  const { db } = fixture();
  saveCheckpointSet(db, setup);
  db.exec(
    "CREATE TRIGGER refuse_approval BEFORE INSERT ON review_checkpoint_approvals BEGIN SELECT RAISE(ABORT,'disk simulation'); END",
  );
  expect(() => approveCheckpoint(db, approval)).toThrow("disk simulation");
  expect(listCheckpoints(db, "p", "r1")[0]?.state).toBe("held");
  db.exec("DROP TRIGGER refuse_approval");
  approveCheckpoint(db, approval);
  db.exec("DELETE FROM projects WHERE id='p'");
  expect(listCheckpoints(db, "p", "r1")).toEqual([]);
  expect(db.prepare("SELECT * FROM review_checkpoint_approvals").all()).toEqual([]);
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it("refuses replay after a gate is invalidated and validates boundary values", () => {
  const { db } = fixture();
  expect(saveCheckpointSet(db, { ...setup, createdAt: "not-a-date" })).toEqual({
    ok: false,
    reason: "invalid-input",
  });
  expect(approveCheckpoint(db, { ...approval, idempotencyKey: "not-a-uuid" })).toEqual({
    ok: false,
    reason: "invalid-input",
  });
  saveCheckpointSet(db, setup);
  approveCheckpoint(db, approval);
  db.exec("UPDATE review_checkpoints SET state='invalidated' WHERE checkpoint_id='audio-gate'");
  expect(approveCheckpoint(db, approval)).toEqual({ ok: false, reason: "conflict" });
  expect(listCheckpoints(db, "p", "r1")[0]?.state).toBe("invalidated");
});

it("enforces scoped work ownership and state constraints in SQLite", () => {
  const { db } = fixture();
  saveCheckpointSet(db, setup);
  expect(() =>
    db.exec("UPDATE review_checkpoints SET work_id='r2-audio' WHERE checkpoint_id='audio-gate'"),
  ).toThrow();
  expect(() =>
    db.exec("UPDATE review_checkpoints SET state='unknown' WHERE checkpoint_id='audio-gate'"),
  ).toThrow();
  expect(() =>
    db.exec("UPDATE review_checkpoints SET revision_id='missing' WHERE checkpoint_id='audio-gate'"),
  ).toThrow();
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
});

it.each(["done", "failed", "canceled"] as const)(
  "satisfies a released closure after every reservation settles as %s",
  (terminal) => {
    const { db } = fixture();
    saveCheckpointSet(db, setup);
    approveCheckpoint(db, approval);
    for (const [key, workId] of [
      ["audio:body", "r1-audio"],
      ["video:export", "r1-video"],
    ] as const)
      db.prepare(`INSERT INTO revision_work_reservations
        (project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint)
        VALUES ('p','r1',?,?,NULL,?,NULL,NULL)`).run(key, workId, fingerprint);
    const closure = {
      projectId: "p",
      revisionId: "r1",
      checkpointId: "audio-gate",
      workKeys: ["audio:body", "video:export"],
    };
    db.exec("UPDATE revision_work SET state='done' WHERE id='r1-audio'");
    expect(settleCheckpointClosures(db, [closure])).toEqual([]);
    expect(listCheckpoints(db, "p", "r1")[0]?.state).toBe("released");
    db.prepare("UPDATE revision_work SET state=? WHERE id='r1-video'").run(terminal);
    expect(settleCheckpointClosures(db, [closure])).toMatchObject([
      { checkpointId: "audio-gate", state: "satisfied" },
    ]);
    expect(approveCheckpoint(db, approval)).toMatchObject({
      ok: false,
      reason: "duplicate",
      value: { state: "satisfied" },
    });
    expect(settleCheckpointClosures(db, [closure])).toEqual([]);
  },
);

it("keeps a released checkpoint open when any reviewed reservation is missing", () => {
  const { db } = fixture();
  saveCheckpointSet(db, setup);
  approveCheckpoint(db, approval);
  db.prepare(`INSERT INTO revision_work_reservations
    (project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint)
    VALUES ('p','r1','audio:body','r1-audio',NULL,?,NULL,NULL)`).run(fingerprint);
  db.exec("UPDATE revision_work SET state='done' WHERE id='r1-audio'");
  expect(
    settleCheckpointClosures(db, [
      {
        projectId: "p",
        revisionId: "r1",
        checkpointId: "audio-gate",
        workKeys: ["audio:body", "video:missing"],
      },
    ]),
  ).toEqual([]);
  expect(listCheckpoints(db, "p", "r1")[0]?.state).toBe("released");
});
