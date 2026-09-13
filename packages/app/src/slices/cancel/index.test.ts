import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ProjectEvent } from "../../kernel/events.js";
import type { Log } from "../../kernel/log.js";
import type { StageKind, StageState } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import { projectPaused, setProjectPaused, stagesOf } from "../admission/repo.js";
import { settleCheckpointClosures } from "../checkpoints/repo.js";
import { activeRun } from "../schedules/repo.js";
import type { CancelDeps } from "./index.js";
import { canceledByUser, cancelProject } from "./index.js";

// Cancel from the slice's side: the abort is the runner's, and what is left on the rows
// afterwards is this module's.

const silent: Log = { write: (): void => {} };
const projectId = "p1";
const clock = fixedClock("2026-09-03T09:00:00.000Z");

interface Harness {
  readonly db: DatabaseSync;
  readonly events: ProjectEvent[];
  readonly deps: CancelDeps;
  readonly stateOf: (kind: StageKind) => StageState;
}

// `abort` stands in for the runner: it is what the aborted stages' own unwinding writes.
function harness(
  states: Partial<Record<StageKind, StageState>>,
  abort: (db: DatabaseSync) => void = concludes,
): Harness {
  const db = openDb(join(mkdtempSync(join(tmpdir(), "slopify-cancel-")), "test.db"));
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES (?, 'Rope', '16:9', '{}', ?, ?)").run(
    projectId,
    "2026-09-03",
    "2026-09-03",
  );
  for (const kind of stageKinds) {
    db.prepare(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, 'generate', ?)",
    ).run(`s-${kind}`, projectId, kind, states[kind] ?? "pending");
  }
  const events: ProjectEvent[] = [];
  return {
    db,
    events,
    stateOf: (kind) =>
      stagesOf(db, projectId).find((stage) => stage.kind === kind)?.state ?? "pending",
    deps: {
      db,
      clock,
      log: silent,
      abort: (): Promise<void> => {
        abort(db);
        return Promise.resolve();
      },
      settleCheckpoints: () => {},
      emit: (_projectId, event) => {
        events.push(event);
      },
    },
  };
}

// The runner's own answer to an aborted stage: `canceled`, with the reason it carries.
function concludes(db: DatabaseSync): void {
  db.prepare(
    "UPDATE stages SET state = 'canceled', failure_reason = ? WHERE state = 'running'",
  ).run(canceledByUser);
}

function scheduleProject(db: DatabaseSync): void {
  db.prepare(
    "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES ('t1',1,'hash',?)",
  ).run(clock.now().toISOString());
  db.prepare(
    `INSERT INTO schedules
     (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,
      spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at,
      mutation_id,mutation_hash,deleted_at)
     VALUES ('schedule','Daily','t1',1,'{"kind":"daily","time":"09:00"}','UTC','skip','skip',
             NULL,'[]','active',1,'hash','2026-09-04T09:00:00.000Z',?,?,NULL,NULL,NULL)`,
  ).run(clock.now().toISOString(), clock.now().toISOString());
  db.prepare(
    `INSERT INTO schedule_runs
     (id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,
      started_at,ended_at,projects_settled_at,error)
     VALUES ('run','schedule','2026-09-03T09:00:00.000Z','succeeded',NULL,?,NULL,?,?,NULL,NULL)`,
  ).run(JSON.stringify([projectId]), clock.now().toISOString(), clock.now().toISOString());
}

describe("cancelProject", () => {
  // Each `running` stage is marked `canceled`, `pending` stages stay `pending`, and the
  // project reads `canceled`.
  it("reports the stages it stopped and leaves the pending ones pending", async () => {
    const h = harness({ audio: "running", images: "running", article: "done" });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["audio", "images"], state: "canceled" });
    expect(h.stateOf("video")).toBe("pending");
    expect(h.stateOf("article")).toBe("done");
  });

  it("settles a scheduled occurrence before a later edit can reopen its canceled project", async () => {
    const h = harness({ audio: "running", article: "done" });
    scheduleProject(h.db);

    await cancelProject(h.deps, projectId);
    expect(
      h.db.prepare("SELECT projects_settled_at FROM schedule_runs WHERE id='run'").get(),
    ).toEqual({ projects_settled_at: clock.now().toISOString() });

    h.db.prepare("UPDATE stages SET state='pending' WHERE project_id=?").run(projectId);
    expect(activeRun(h.db, "schedule", "2026-09-04T09:00:00.000Z")).toBe(false);
  });

  it("rolls back its fallback terminal stage if schedule settlement cannot commit", async () => {
    const h = harness({ audio: "running", article: "done" }, () => {});
    scheduleProject(h.db);
    h.db.exec(`CREATE TRIGGER reject_schedule_settlement
      BEFORE UPDATE OF projects_settled_at ON schedule_runs
      BEGIN SELECT RAISE(ABORT, 'settlement unavailable'); END`);

    await expect(cancelProject(h.deps, projectId)).rejects.toThrow("settlement unavailable");

    expect(h.stateOf("audio")).toBe("running");
    expect(
      h.db.prepare("SELECT projects_settled_at FROM schedule_runs WHERE id='run'").get(),
    ).toEqual({ projects_settled_at: null });
  });

  // A stage whose output was stored in the same instant as the cancel stays `done`; cancel
  // never rolls back a stored output.
  it("does not count a stage that finished while the cancel was landing", async () => {
    const h = harness({ audio: "running", images: "running" }, (db) => {
      db.prepare("UPDATE stages SET state = 'done' WHERE kind = 'audio'").run();
      concludes(db);
    });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["images"], state: "canceled" });
    expect(h.stateOf("audio")).toBe("done");
  });

  // A second click is a no-op.
  it("changes nothing and aborts nothing when the project is not running", async () => {
    let aborts = 0;
    const h = harness({ audio: "canceled", article: "done" }, () => {
      aborts += 1;
    });

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: [], state: "canceled" });
    expect(aborts).toBe(0);
    expect(h.events).toEqual([]);
  });

  // The invariant: after cancel completes no stage of the project is `running`, true even
  // when the runner could not write the row itself.
  it("marks a stage the runner left running and tells the page about it", async () => {
    const h = harness({ audio: "running" }, () => {});

    const result = await cancelProject(h.deps, projectId);

    expect(result).toEqual({ ok: true, canceled: ["audio"], state: "canceled" });
    expect(h.events).toEqual([
      {
        type: "stage.state",
        projectId,
        stage: "audio",
        state: "canceled",
        failureReason: canceledByUser,
      },
      { type: "project.state", projectId, state: "canceled" },
    ]);
  });

  // The runner announced the state it left the project in; saying it again would tell
  // every open page the same thing twice.
  it("stays quiet when the runner already wrote every row", async () => {
    const h = harness({ audio: "running" });

    await cancelProject(h.deps, projectId);

    expect(h.events).toEqual([]);
  });

  it("explicitly cancels pending work when the active stage finishes during abort", async () => {
    const h = harness(
      {
        research: "skipped",
        article: "done",
        audio: "running",
        images: "skipped",
        thumbnail: "skipped",
        video: "pending",
      },
      (db) => {
        db.prepare("UPDATE stages SET state = 'done' WHERE kind = 'audio'").run();
      },
    );
    expect(await cancelProject(h.deps, projectId)).toEqual({
      ok: true,
      canceled: [],
      state: "canceled",
    });
    expect(h.stateOf("audio")).toBe("done");
    expect(h.stateOf("video")).toBe("canceled");
  });

  it("cancels paused work without unpausing it into a running stage", async () => {
    const h = harness({ research: "skipped", article: "done", audio: "pending" });
    setProjectPaused(h.db, projectId, true, clock.now().toISOString());
    expect(await cancelProject(h.deps, projectId)).toMatchObject({ ok: true, state: "canceled" });
    expect(projectPaused(h.db, projectId)).toBe(false);
    expect(h.stateOf("article")).toBe("done");
    expect(h.stateOf("audio")).toBe("canceled");
  });

  it("satisfies a released gate after cancel terminalizes its last pending work", async () => {
    const h = harness({ audio: "running", video: "pending" });
    const fingerprint = "a".repeat(64);
    h.db
      .prepare("INSERT INTO project_revisions VALUES ('r1',?,NULL,NULL,'{}','{}','{}',?)")
      .run(projectId, clock.now().toISOString());
    h.db.prepare("INSERT INTO project_heads VALUES (?,'r1')").run(projectId);
    for (const kind of ["audio", "video"] as const)
      h.db
        .prepare(`INSERT INTO revision_work
        (id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at)
        VALUES (?,?,?,?,?,?,?,'allowed',?)`)
        .run(
          `w-${kind}`,
          projectId,
          "r1",
          `s-${kind}`,
          kind,
          fingerprint,
          kind === "audio" ? "running" : "pending",
          clock.now().toISOString(),
        );
    for (const [key, workId] of [
      ["audio:body", "w-audio"],
      ["video:export", "w-video"],
    ] as const)
      h.db
        .prepare(`INSERT INTO revision_work_reservations
        (project_id,revision_id,work_key,work_id,piece_id,fingerprint,logical_key,desired_fingerprint)
        VALUES (?,'r1',?,?,NULL,?,NULL,NULL)`)
        .run(projectId, key, workId, fingerprint);
    h.db
      .prepare(`INSERT INTO review_checkpoints
      (project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at,approved_at)
      VALUES (?,'r1','audio-gate','audio','w-audio',?,'released',?,?)`)
      .run(projectId, fingerprint, clock.now().toISOString(), clock.now().toISOString());

    let settled: readonly unknown[] = [];
    await cancelProject(
      {
        ...h.deps,
        settleCheckpoints: () => {
          settled = settleCheckpointClosures(h.db, [
            {
              projectId,
              revisionId: "r1",
              checkpointId: "audio-gate",
              workKeys: ["audio:body", "video:export"],
            },
          ]);
        },
      },
      projectId,
      {
        baseRevisionId: "r1",
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
    );

    expect(settled).toMatchObject([{ checkpointId: "audio-gate", state: "satisfied" }]);
    expect(h.db.prepare("SELECT state FROM review_checkpoints").get()).toEqual({
      state: "satisfied",
    });
  });

  it("answers no-project for an id that has none", async () => {
    const h = harness({ audio: "running" });

    await expect(cancelProject(h.deps, "nope")).resolves.toEqual({
      ok: false,
      reason: "no-project",
    });
  });
});
