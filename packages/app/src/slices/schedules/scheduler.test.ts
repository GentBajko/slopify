import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { activeRun, settleScheduleRunsForProject, settleTerminalScheduleRuns } from "./repo.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule } from "./service.js";

it("skips a later occurrence until every project from the prior dispatch is terminal", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const scheduleId = randomUUID();
    expect(
      createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string, version: number) => templateById(h.deps.db, id, version),
    };
    expect(
      createSchedule(deps, {
        id: scheduleId,
        name: "Daily batch",
        templateId,
        templateVersion: 1,
        cadence: { kind: "daily", time: "00:01" },
        timezone: "UTC",
        missedPolicy: "skip",
        overlapPolicy: "skip",
        spendLimitCents: null,
        items: [
          { title: "First topic", values: {} },
          { title: "Second topic", values: {} },
        ],
      }).ok,
    ).toBe(true);
    const runner = createScheduleRunner(deps);

    await runner.tick(new Date("2026-09-12T00:01:30.000Z"));
    const first = h.deps.db
      .prepare("SELECT project_ids_json FROM schedule_runs WHERE schedule_id=?")
      .get(scheduleId);
    const projectIds = JSON.parse(String(first?.project_ids_json)) as string[];
    // One run starts one project, from the first topic, and takes that topic off the queue.
    expect(projectIds).toHaveLength(1);
    expect(h.events).toEqual(projectIds);
    expect(
      JSON.parse(
        String(
          h.deps.db.prepare("SELECT items_json FROM schedules WHERE id=?").get(scheduleId)
            ?.items_json,
        ),
      ),
    ).toEqual([{ title: "Second topic", values: {} }]);
    const [outstandingId] = projectIds;
    if (outstandingId === undefined) throw new Error("Expected the scheduled run's project.");
    // A project from some other occurrence that has already finished (no row: never active).
    const finishedId = randomUUID();

    // Migration/boot recovery freezes terminal history before a user can edit it.
    h.deps.db
      .prepare("UPDATE schedule_runs SET projects_settled_at=NULL WHERE schedule_id=?")
      .run(scheduleId);
    expect(settleTerminalScheduleRuns(h.deps.db, "2026-09-12T00:01:45.000Z")).toBe(1);

    // The run's project is still queued.
    h.deps.db
      .prepare(
        "UPDATE stages SET state='pending',finished_at=NULL WHERE project_id=? AND kind='article'",
      )
      .run(outstandingId);
    h.deps.db
      .prepare("UPDATE project_queue SET state='queued' WHERE project_id=?")
      .run(outstandingId);
    // The shared start fixture is entirely supplied, so dispatch correctly settles it
    // immediately. Clear that marker after making one project pending to model a real
    // generated batch whose terminal transition has not happened yet.
    h.deps.db
      .prepare("UPDATE schedule_runs SET projects_settled_at=NULL WHERE schedule_id=?")
      .run(scheduleId);
    expect(settleScheduleRunsForProject(h.deps.db, finishedId, "2026-09-12T00:02:00.000Z")).toBe(0);

    // A newer retained occurrence whose project is already terminal cannot hide the
    // older occurrence that still owns outstanding work.
    const newerRunId = randomUUID();
    h.deps.db
      .prepare(
        `INSERT INTO schedule_runs
         (id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,
          started_at,ended_at,projects_settled_at,error)
         VALUES (?,?,'2026-09-12T12:00:00.000Z','succeeded',NULL,?,NULL,
                 '2026-09-12T12:00:00.000Z','2026-09-12T12:00:00.000Z',NULL,NULL)`,
      )
      .run(newerRunId, scheduleId, JSON.stringify([finishedId]));
    expect(activeRun(h.deps.db, scheduleId, "2026-09-13T00:01:30.000Z")).toBe(true);
    expect(
      h.deps.db.prepare("SELECT projects_settled_at FROM schedule_runs WHERE id=?").get(newerRunId),
    ).toEqual({ projects_settled_at: "2026-09-13T00:01:30.000Z" });
    h.deps.db.prepare("DELETE FROM schedule_runs WHERE id=?").run(newerRunId);

    await runner.tick(new Date("2026-09-13T00:01:30.000Z"));

    expect(h.events).toEqual(projectIds);
    expect(
      h.deps.db
        .prepare(
          "SELECT status,error FROM schedule_runs WHERE schedule_id=? ORDER BY scheduled_for",
        )
        .all(scheduleId),
    ).toEqual([
      { status: "succeeded", error: null },
      {
        status: "skipped",
        error: "Skipped because the previous run of this schedule was still going.",
      },
    ]);

    h.deps.db
      .prepare("UPDATE stages SET state='running' WHERE project_id=? AND kind='article'")
      .run(outstandingId);
    h.deps.db
      .prepare("UPDATE project_queue SET state='active' WHERE project_id=?")
      .run(outstandingId);
    expect(activeRun(h.deps.db, scheduleId, "2026-09-13T00:03:00.000Z")).toBe(true);

    h.deps.db
      .prepare("UPDATE stages SET state='pending' WHERE project_id=? AND kind='article'")
      .run(outstandingId);
    h.deps.db
      .prepare(
        "INSERT INTO project_controls(project_id,paused) VALUES(?,1) ON CONFLICT(project_id) DO UPDATE SET paused=1",
      )
      .run(outstandingId);
    expect(activeRun(h.deps.db, scheduleId, "2026-09-13T00:04:00.000Z")).toBe(true);

    // A checkpoint hold is represented by pending project work until approval.
    h.deps.db.prepare("UPDATE project_controls SET paused=0 WHERE project_id=?").run(outstandingId);
    expect(activeRun(h.deps.db, scheduleId, "2026-09-13T00:05:00.000Z")).toBe(true);

    h.deps.db
      .prepare("UPDATE stages SET state='done',finished_at=? WHERE project_id=?")
      .run("2026-09-13T00:02:00.000Z", outstandingId);
    h.deps.db
      .prepare("UPDATE project_queue SET state='finished' WHERE project_id=?")
      .run(outstandingId);
    expect(settleScheduleRunsForProject(h.deps.db, outstandingId, "2026-09-13T00:06:00.000Z")).toBe(
      1,
    );
    expect(
      h.deps.db
        .prepare(
          "SELECT projects_settled_at FROM schedule_runs WHERE schedule_id=? AND project_ids_json!='[]'",
        )
        .get(scheduleId),
    ).toEqual({ projects_settled_at: "2026-09-13T00:06:00.000Z" });

    // No scheduler read happened between terminal settlement and this later edit. The
    // runner's terminal transaction has already made the occurrence immutable.
    h.deps.db
      .prepare(
        "UPDATE stages SET state='pending',finished_at=NULL WHERE project_id=? AND kind='article'",
      )
      .run(finishedId);
    expect(activeRun(h.deps.db, scheduleId, "2026-09-13T00:07:00.000Z")).toBe(false);

    await runner.tick(new Date("2026-09-14T00:01:30.000Z"));
    expect(h.events).toHaveLength(2);
    expect(
      h.deps.db
        .prepare("SELECT status FROM schedule_runs WHERE schedule_id=? ORDER BY scheduled_for")
        .all(scheduleId),
    ).toEqual([{ status: "succeeded" }, { status: "skipped" }, { status: "succeeded" }]);
    // The run that takes the last topic completes the schedule.
    expect(
      h.deps.db
        .prepare("SELECT status,next_run_at,items_json FROM schedules WHERE id=?")
        .get(scheduleId),
    ).toEqual({ status: "completed", next_run_at: null, items_json: "[]" });
  } finally {
    h.close();
  }
});

it("reports a failed finalization and recovers its running occurrence on the next tick", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const scheduleId = randomUUID();
    expect(
      createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string, version: number) => templateById(h.deps.db, id, version),
    };
    expect(
      createSchedule(deps, {
        id: scheduleId,
        name: "Daily",
        templateId,
        templateVersion: 1,
        cadence: { kind: "daily", time: "00:01" },
        timezone: "UTC",
        missedPolicy: "skip",
        overlapPolicy: "skip",
        spendLimitCents: null,
        items: [],
      }).ok,
    ).toBe(true);
    h.deps.db.exec(`CREATE TRIGGER reject_schedule_finalization
      BEFORE UPDATE OF status ON schedule_runs
      WHEN OLD.status='running'
      BEGIN SELECT RAISE(ABORT, 'finalization unavailable'); END`);
    const runner = createScheduleRunner(deps);

    await expect(runner.tick(new Date("2026-09-12T00:02:00.000Z"))).rejects.toThrow(
      "finalization unavailable",
    );
    expect(
      h.deps.db
        .prepare(
          "SELECT status,request_id,project_ids_json,estimate_json FROM schedule_runs WHERE schedule_id=?",
        )
        .get(scheduleId),
    ).toEqual({
      status: "running",
      request_id: expect.any(String),
      project_ids_json: expect.stringMatching(/^\[.+\]$/),
      estimate_json: expect.stringMatching(/^\[.+\]$/),
    });

    h.deps.db.exec("DROP TRIGGER reject_schedule_finalization");
    const admitted = h.deps.db
      .prepare("SELECT project_ids_json FROM schedule_runs WHERE schedule_id=?")
      .get(scheduleId);
    const [projectId] = JSON.parse(String(admitted?.project_ids_json)) as string[];
    if (projectId === undefined) throw new Error("Expected a recorded scheduled project.");
    h.deps.db
      .prepare(
        "UPDATE stages SET state='pending',finished_at=NULL WHERE project_id=? AND kind='article'",
      )
      .run(projectId);
    h.deps.db
      .prepare("UPDATE schedule_runs SET projects_settled_at=NULL WHERE schedule_id=?")
      .run(scheduleId);
    await runner.tick(new Date("2026-09-12T00:03:00.000Z"));
    expect(
      h.deps.db
        .prepare(
          "SELECT status,error,request_id,project_ids_json,estimate_json FROM schedule_runs WHERE schedule_id=?",
        )
        .get(scheduleId),
    ).toEqual(
      expect.objectContaining({
        status: "failed",
        error: "The previous schedule tick could not record this run's result.",
        request_id: expect.any(String),
        project_ids_json: expect.stringMatching(/^\[.+\]$/),
        estimate_json: expect.stringMatching(/^\[.+\]$/),
      }),
    );

    await runner.tick(new Date("2026-09-13T00:01:30.000Z"));
    expect(h.events).toEqual([projectId]);
    expect(
      h.deps.db
        .prepare(
          "SELECT status,error FROM schedule_runs WHERE schedule_id=? ORDER BY scheduled_for",
        )
        .all(scheduleId),
    ).toEqual([
      {
        status: "failed",
        error: "The previous schedule tick could not record this run's result.",
      },
      {
        status: "skipped",
        error: "Skipped because the previous run of this schedule was still going.",
      },
    ]);
  } finally {
    h.close();
  }
});

it("recovers admitted project ids from the exact Start receipt after a crash before linkage", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const scheduleId = randomUUID();
    expect(
      createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok,
    ).toBe(true);
    const scheduleDeps = () => ({
      ...h.deps,
      template: (id: string, version: number) => templateById(h.deps.db, id, version),
    });
    expect(
      createSchedule(scheduleDeps(), {
        id: scheduleId,
        name: "Crash-safe daily",
        templateId,
        templateVersion: 1,
        cadence: { kind: "daily", time: "00:01" },
        timezone: "UTC",
        missedPolicy: "skip",
        overlapPolicy: "skip",
        spendLimitCents: null,
        items: [],
      }).ok,
    ).toBe(true);
    h.deps.db.exec(`CREATE TRIGGER reject_schedule_project_link
      BEFORE UPDATE OF project_ids_json ON schedule_runs
      WHEN OLD.status='running' AND json_array_length(NEW.project_ids_json)>0
      BEGIN SELECT RAISE(ABORT, 'simulated crash before schedule linkage'); END`);

    await expect(
      createScheduleRunner(scheduleDeps()).tick(new Date("2026-09-12T00:01:30.000Z")),
    ).rejects.toThrow("simulated crash before schedule linkage");

    const receipt = h.deps.db.prepare("SELECT id,result_json FROM play_start_receipts").get();
    const result = JSON.parse(String(receipt?.result_json)) as {
      readonly requestId: string;
      readonly projectIds: readonly string[];
    };
    expect(result.projectIds).toHaveLength(1);
    expect(
      h.deps.db
        .prepare("SELECT status,request_id,project_ids_json FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId),
    ).toEqual({ status: "running", request_id: result.requestId, project_ids_json: "[]" });
    expect(receipt?.id).toBe(result.requestId);

    const [projectId] = result.projectIds;
    if (projectId === undefined) throw new Error("Expected the Start receipt to record a project.");
    h.deps.db.exec("DROP TRIGGER reject_schedule_project_link");
    h.reopen();

    const restarted = createScheduleRunner(scheduleDeps());
    expect(restarted.recover(new Date("2026-09-12T00:02:00.000Z"))).toBe(1);
    expect(
      h.deps.db
        .prepare("SELECT status,request_id,project_ids_json FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId),
    ).toEqual({
      status: "failed",
      request_id: result.requestId,
      project_ids_json: JSON.stringify(result.projectIds),
    });
    expect(
      h.deps.db
        .prepare("SELECT projects_settled_at FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId),
    ).toEqual({ projects_settled_at: "2026-09-12T00:02:00.000Z" });

    // Recovery observed the supplied project as terminal and persisted that fact. A
    // post-recovery project edit therefore cannot turn this failed occurrence active.
    h.deps.db
      .prepare(
        "UPDATE stages SET state='pending',finished_at=NULL WHERE project_id=? AND kind='article'",
      )
      .run(projectId);

    await restarted.tick(new Date("2026-09-13T00:01:30.000Z"));
    expect(h.events).toHaveLength(2);
    expect(h.events[0]).toBe(projectId);
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM play_start_receipts").get()).toEqual({
      n: 2,
    });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 2 });
    expect(
      h.deps.db
        .prepare("SELECT status FROM schedule_runs WHERE schedule_id=? ORDER BY scheduled_for")
        .all(scheduleId),
    ).toEqual([{ status: "failed" }, { status: "succeeded" }]);
  } finally {
    h.close();
  }
});

it("fills the chosen keyword and the project title from the first topic", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const scheduleId = randomUUID();
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        title: "D&D Lore To Sleep To: {{Topic}}",
        values: { Topic: "Szass Tam", "Min. Word Count": "1", "Max. Word Count": "2" },
      },
    };
    expect(createTemplate(h.deps, { id: templateId, name: "Lore", document }).ok).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string, version: number) => templateById(h.deps.db, id, version),
    };
    expect(
      createSchedule(deps, {
        id: scheduleId,
        name: "Nightly lore",
        templateId,
        templateVersion: 1,
        cadence: { kind: "daily", time: "00:01" },
        timezone: "UTC",
        items: [
          { title: "Owlbears", values: {} },
          { title: "Mimics", values: {} },
        ],
        topicKeyword: "Topic",
        values: { "Min. Word Count": "15000", "Max. Word Count": "18000" },
      }).ok,
    ).toBe(true);

    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));

    expect(h.events).toHaveLength(1);
    expect(
      h.deps.db.prepare("SELECT title FROM projects WHERE id=?").get(h.events[0] ?? ""),
    ).toEqual({ title: "D&D Lore To Sleep To: Owlbears" });
    const draft = h.deps.db
      .prepare("SELECT document_json FROM play_drafts ORDER BY created_at DESC LIMIT 1")
      .get();
    expect(JSON.parse(String(draft?.document_json)).form.values).toEqual({
      Topic: "Owlbears",
      "Min. Word Count": "15000",
      "Max. Word Count": "18000",
    });
    expect(
      JSON.parse(
        String(
          h.deps.db.prepare("SELECT items_json FROM schedules WHERE id=?").get(scheduleId)
            ?.items_json,
        ),
      ),
    ).toEqual([{ title: "Mimics", values: {} }]);
  } finally {
    h.close();
  }
});
