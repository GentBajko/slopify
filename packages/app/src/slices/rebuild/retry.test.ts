import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { claimWork } from "../../kernel/runner/work-authority.js";
import { recoverCheckpointWork } from "../checkpoints/recovery.js";
import { waitToRetry, wakeRetries } from "./retry.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const work: WorkRef = {
  projectId: "p1",
  revisionId: "r1",
  workId: "w1",
  stageId: "s1",
  kind: "images",
  fingerprint: "f",
};

function database(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  db.exec("INSERT INTO projects VALUES ('p1','Saved','16:9','{}','old','old')");
  db.exec(
    "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s1','p1','images','generate','running')",
  );
  db.exec("INSERT INTO project_revisions VALUES ('r1','p1',NULL,NULL,'{}','{}','{}','old')");
  db.exec(
    "INSERT INTO revision_work (id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('w1','p1','r1','s1','images','f','running','allowed','old')",
  );
  db.exec(
    `INSERT INTO revision_work_pieces (id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state,submitted_at)
     VALUES ('pc1','w1','image:a','f','f','{}','failed','allowed','old')`,
  );
  return db;
}

function row(db: DatabaseSync): Record<string, unknown> | undefined {
  return db
    .prepare("SELECT state,dispatch_state,retry_at,auto_retries,failure_kind FROM revision_work")
    .get();
}

const rateLimited = { kind: "rate_limit" as const };

describe("waitToRetry", () => {
  it("puts the step back to wait with the time it may run again", () => {
    const db = database();
    const at = waitToRetry({ db, clock }, work, rateLimited, "limited", () => 0.5);
    expect(at).toBe("2026-09-27T10:02:00.000Z");
    expect(row(db)).toEqual({
      state: "pending",
      dispatch_state: "allowed",
      retry_at: at,
      auto_retries: 1,
      failure_kind: "rate_limit",
    });
    // Its unfinished piece may be sent again.
    expect(db.prepare("SELECT state FROM revision_work_pieces").get()).toEqual({
      state: "pending",
    });
  });

  it("reports the failure once the waits are used up, or at once for a refusal", () => {
    const db = database();
    db.exec("UPDATE revision_work SET auto_retries=4");
    expect(waitToRetry({ db, clock }, work, rateLimited, "limited", () => 0.5)).toBeUndefined();
    db.exec("UPDATE revision_work SET auto_retries=0");
    expect(
      waitToRetry({ db, clock }, work, { kind: "refusal" }, "refused", () => 0.5),
    ).toBeUndefined();
    expect(row(db)).toMatchObject({ state: "running", retry_at: null });
  });
});

describe("wakeRetries", () => {
  it("ticks a project once its wait is over and clears the wait so the claim can take it", () => {
    const db = database();
    waitToRetry({ db, clock }, work, rateLimited, "limited", () => 0.5);
    const ticked: string[] = [];
    const runner = { tick: (projectId: string) => ticked.push(projectId) };

    expect(wakeRetries(db, clock, runner)).toEqual([]);
    expect(wakeRetries(db, fixedClock("2026-09-27T10:02:00.000Z"), runner)).toEqual(["p1"]);
    expect(ticked).toEqual(["p1"]);
    expect(row(db)).toMatchObject({ state: "pending", retry_at: null, auto_retries: 1 });
    expect(claimWork(db, work)).toBe(true);
  });

  it("leaves a paused project's wait for Resume", () => {
    const db = database();
    waitToRetry({ db, clock }, work, rateLimited, "limited", () => 0.5);
    db.exec("INSERT INTO project_controls (project_id,paused) VALUES ('p1',1)");
    expect(wakeRetries(db, fixedClock("2026-09-27T11:00:00.000Z"), { tick: () => {} })).toEqual([]);
  });

  it("keeps a wait across a restart", () => {
    const db = database();
    const at = waitToRetry({ db, clock }, work, rateLimited, "limited", () => 0.5);
    // What boot does with unfinished work: everything else is held for Resume.
    recoverCheckpointWork(db);
    expect(row(db)).toMatchObject({ state: "pending", dispatch_state: "allowed", retry_at: at });
    expect(db.prepare("SELECT state,dispatch_state FROM revision_work_pieces").get()).toEqual({
      state: "pending",
      dispatch_state: "allowed",
    });
  });
});
