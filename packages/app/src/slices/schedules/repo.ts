import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { derive } from "../../kernel/runner/graph.js";
import { projectPaused, stagesOf } from "../admission/repo.js";
import { readStartReceipt } from "../play-drafts/start-repo.js";
import {
  type ScheduleRun,
  type ScheduleSummary,
  scheduleRunSchema,
  scheduleSummarySchema,
} from "./schema.js";

const rowSchema = z.object({
  id: z.string(),
  name: z.string(),
  template_id: z.string(),
  template_version: z.number(),
  cadence_json: z.string(),
  timezone: z.string(),
  missed_policy: z.string(),
  overlap_policy: z.string(),
  spend_limit_cents: z.number().nullable(),
  items_json: z.string(),
  topic_keyword: z.string().nullable(),
  values_json: z.string(),
  status: z.string(),
  version: z.number(),
  next_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  deleted_at: z.string().nullable(),
});

export function scheduleById(db: DatabaseSync, id: string): ScheduleSummary | undefined {
  const row = db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,topic_keyword,values_json,status,version,next_run_at,created_at,updated_at,
       deleted_at
       FROM schedules WHERE id=?`,
    )
    .get(id);
  return row === undefined ? undefined : parseSchedule(row);
}

export function scheduleRows(db: DatabaseSync): readonly ScheduleSummary[] {
  return db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,topic_keyword,values_json,status,version,next_run_at,created_at,updated_at,
       deleted_at
       FROM schedules ORDER BY created_at DESC,id`,
    )
    .all()
    .map(parseSchedule);
}

export function dueSchedules(db: DatabaseSync, now: string): readonly ScheduleSummary[] {
  return db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,topic_keyword,values_json,status,version,next_run_at,created_at,updated_at,
       deleted_at
       FROM schedules WHERE deleted_at IS NULL AND status='active' AND next_run_at IS NOT NULL
       AND next_run_at <= ?
       ORDER BY next_run_at,id`,
    )
    .all(now)
    .map(parseSchedule);
}

export function insertSchedule(
  db: DatabaseSync,
  schedule: ScheduleSummary,
  creationHash: string,
): void {
  db.prepare(
    `INSERT INTO schedules
      (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,
       spend_limit_cents,items_json,topic_keyword,values_json,status,version,creation_hash,
       next_run_at,created_at,updated_at,deleted_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  ).run(
    schedule.id,
    schedule.name,
    schedule.templateId,
    schedule.templateVersion,
    JSON.stringify(schedule.cadence),
    schedule.timezone,
    schedule.missedPolicy,
    schedule.overlapPolicy,
    schedule.spendLimitCents,
    JSON.stringify(schedule.items),
    schedule.topicKeyword,
    JSON.stringify(schedule.values),
    schedule.status,
    schedule.version,
    creationHash,
    schedule.nextRunAt,
    schedule.createdAt,
    schedule.updatedAt,
    schedule.deletedAt,
  );
}

export function updateScheduleRow(
  db: DatabaseSync,
  schedule: ScheduleSummary,
  mutationId: string,
  mutationHash: string,
  baseVersion: number,
): boolean {
  const changed = db
    .prepare(
      `UPDATE schedules SET name=?,template_id=?,template_version=?,cadence_json=?,timezone=?,
       missed_policy=?,overlap_policy=?,spend_limit_cents=?,items_json=?,topic_keyword=?,
       values_json=?,status=?,version=?,
       next_run_at=?,updated_at=?,mutation_id=?,mutation_hash=?
       WHERE id=? AND version=? AND deleted_at IS NULL`,
    )
    .run(
      schedule.name,
      schedule.templateId,
      schedule.templateVersion,
      JSON.stringify(schedule.cadence),
      schedule.timezone,
      schedule.missedPolicy,
      schedule.overlapPolicy,
      schedule.spendLimitCents,
      JSON.stringify(schedule.items),
      schedule.topicKeyword,
      JSON.stringify(schedule.values),
      schedule.status,
      schedule.version,
      schedule.nextRunAt,
      schedule.updatedAt,
      mutationId,
      mutationHash,
      schedule.id,
      baseVersion,
    );
  return Number(changed.changes) === 1;
}

export function tombstoneScheduleRow(
  db: DatabaseSync,
  id: string,
  version: number,
  deletedAt: string,
): boolean {
  const changed = db
    .prepare(
      `UPDATE schedules SET deleted_at=?,next_run_at=NULL,version=version+1,updated_at=?
       WHERE id=? AND version=? AND deleted_at IS NULL`,
    )
    .run(deletedAt, deletedAt, id, version);
  return Number(changed.changes) === 1;
}

export function setScheduleStatus(
  db: DatabaseSync,
  id: string,
  version: number,
  status: ScheduleSummary["status"],
  nextRunAt: string | null,
  updatedAt: string,
): boolean {
  const changed = db
    .prepare(
      `UPDATE schedules SET status=?,next_run_at=?,version=version+1,updated_at=?
       WHERE id=? AND version=? AND deleted_at IS NULL`,
    )
    .run(status, nextRunAt, updatedAt, id, version);
  return Number(changed.changes) === 1;
}

export function insertRun(db: DatabaseSync, run: ScheduleRun): boolean {
  try {
    db.prepare(
      `INSERT INTO schedule_runs
       (id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,started_at,ended_at,error)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    ).run(
      run.id,
      run.scheduleId,
      run.scheduledFor,
      run.status,
      run.requestId,
      JSON.stringify(run.projectIds),
      run.estimate === null ? null : JSON.stringify(run.estimate),
      run.startedAt,
      run.endedAt,
      run.error,
    );
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes("UNIQUE")) return false;
    throw error;
  }
}

export function updateRun(db: DatabaseSync, run: ScheduleRun): void {
  db.prepare(
    `UPDATE schedule_runs SET status=?,request_id=?,project_ids_json=?,estimate_json=?,
     ended_at=?,error=? WHERE id=?`,
  ).run(
    run.status,
    run.requestId,
    JSON.stringify(run.projectIds),
    run.estimate === null ? null : JSON.stringify(run.estimate),
    run.endedAt,
    run.error,
    run.id,
  );
}

export function recordRunStartIdentity(db: DatabaseSync, run: ScheduleRun): void {
  if (run.requestId === null) throw new Error("A scheduled Start requires a request identity.");
  const changed = db
    .prepare(
      `UPDATE schedule_runs SET request_id=?,estimate_json=?
       WHERE id=? AND status='running' AND request_id IS NULL AND project_ids_json='[]'`,
    )
    .run(run.requestId, run.estimate === null ? null : JSON.stringify(run.estimate), run.id);
  if (Number(changed.changes) !== 1)
    throw new Error("The scheduled run could not persist its Start identity.");
}

// `used` is the queued topic the run started, removed in the same transaction that records
// the run's projects. It is matched by value rather than position, so an edit saved while the
// run was starting cannot make it remove a different topic. The run that empties the queue
// completes the schedule.
export function recordRunDispatch(
  db: DatabaseSync,
  run: ScheduleRun,
  recordedAt: string,
  used?: ScheduleSummary["items"][number],
): void {
  transact(db, () => {
    if (used !== undefined) consumeTopic(db, run.scheduleId, used, recordedAt);
    const changed = db
      .prepare(
        `UPDATE schedule_runs SET request_id=?,project_ids_json=?,estimate_json=?
         WHERE id=? AND status='running'`,
      )
      .run(
        run.requestId,
        JSON.stringify(run.projectIds),
        run.estimate === null ? null : JSON.stringify(run.estimate),
        run.id,
      );
    if (Number(changed.changes) !== 1)
      throw new Error("The scheduled run could not record its admitted projects.");
    for (const projectId of run.projectIds) settleScheduleRunsForProject(db, projectId, recordedAt);
  });
}

function consumeTopic(
  db: DatabaseSync,
  scheduleId: string,
  used: ScheduleSummary["items"][number],
  updatedAt: string,
): void {
  const schedule = scheduleById(db, scheduleId);
  if (schedule === undefined || schedule.deletedAt !== null) return;
  const key = JSON.stringify(used);
  const at = schedule.items.findIndex((item) => JSON.stringify(item) === key);
  if (at === -1) return;
  const items = schedule.items.filter((_item, index) => index !== at);
  const done = items.length === 0 && (schedule.status === "active" || schedule.status === "paused");
  db.prepare(
    `UPDATE schedules SET items_json=?,status=?,next_run_at=?,version=version+1,updated_at=?
     WHERE id=? AND deleted_at IS NULL`,
  ).run(
    JSON.stringify(items),
    done ? "completed" : schedule.status,
    done ? null : schedule.nextRunAt,
    updatedAt,
    scheduleId,
  );
}

export function runsForSchedule(db: DatabaseSync, scheduleId: string): readonly ScheduleRun[] {
  return db
    .prepare(
      `SELECT id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,
       started_at,ended_at,error FROM schedule_runs WHERE schedule_id=? ORDER BY started_at DESC,id DESC`,
    )
    .all(scheduleId)
    .map(parseRun);
}

export function activeRun(db: DatabaseSync, scheduleId: string, settledAt: string): boolean {
  return transact(db, () => {
    if (
      db
        .prepare("SELECT 1 FROM schedule_runs WHERE schedule_id=? AND status='running' LIMIT 1")
        .get(scheduleId) !== undefined
    )
      return true;
    const occurrences = db
      .prepare(
        `SELECT id,project_ids_json FROM schedule_runs
         WHERE schedule_id=? AND projects_settled_at IS NULL
         AND json_array_length(project_ids_json)>0
         ORDER BY scheduled_for,started_at,id`,
      )
      .all(scheduleId)
      .map((row) => z.object({ id: z.string(), project_ids_json: z.string() }).parse(row));
    let anyActive = false;
    for (const occurrence of occurrences) {
      const ids = z.array(z.string()).parse(JSON.parse(occurrence.project_ids_json));
      if (ids.some((id) => projectIsActive(db, id))) {
        anyActive = true;
        continue;
      }
      db.prepare(
        "UPDATE schedule_runs SET projects_settled_at=? WHERE id=? AND projects_settled_at IS NULL",
      ).run(settledAt, occurrence.id);
    }
    return anyActive;
  });
}

/**
 * Permanently settles every scheduled occurrence containing `projectId` once all projects
 * admitted by that occurrence are terminal. The runner calls this in the same transaction as
 * its terminal work write, so a later edit creates a new revision without reopening history.
 */
export function settleScheduleRunsForProject(
  db: DatabaseSync,
  projectId: string,
  settledAt: string,
): number {
  return transact(db, () => {
    const occurrences = db
      .prepare(
        `SELECT DISTINCT schedule_runs.id, schedule_runs.project_ids_json
         FROM schedule_runs, json_each(schedule_runs.project_ids_json) AS admitted
         WHERE schedule_runs.projects_settled_at IS NULL AND admitted.value=?`,
      )
      .all(projectId)
      .map((row) => z.object({ id: z.string(), project_ids_json: z.string() }).parse(row));
    let settled = 0;
    for (const occurrence of occurrences) {
      const ids = z.array(z.string()).parse(JSON.parse(occurrence.project_ids_json));
      if (ids.some((id) => projectIsActive(db, id))) continue;
      const changed = db
        .prepare(
          "UPDATE schedule_runs SET projects_settled_at=? WHERE id=? AND projects_settled_at IS NULL",
        )
        .run(settledAt, occurrence.id);
      settled += Number(changed.changes);
    }
    return settled;
  });
}

/** Freeze every terminal admitted occurrence during boot/migration recovery before the UI can
 * create a new revision on one of its projects. */
export function settleTerminalScheduleRuns(db: DatabaseSync, settledAt: string): number {
  return transact(db, () => {
    const projectIds = db
      .prepare(
        `SELECT DISTINCT admitted.value AS project_id
         FROM schedule_runs, json_each(schedule_runs.project_ids_json) AS admitted
         WHERE schedule_runs.projects_settled_at IS NULL`,
      )
      .all()
      .map((row) => z.object({ project_id: z.string() }).parse(row).project_id);
    let settled = 0;
    for (const projectId of projectIds)
      settled += settleScheduleRunsForProject(db, projectId, settledAt);
    return settled;
  });
}

function projectIsActive(db: DatabaseSync, projectId: string): boolean {
  if (db.prepare("SELECT 1 FROM projects WHERE id=?").get(projectId) === undefined) return false;
  const state = derive(stagesOf(db, projectId), projectPaused(db, projectId));
  return state !== "done" && state !== "failed" && state !== "canceled";
}

export function recoverRunningRuns(
  db: DatabaseSync,
  endedAt: string,
  error = "Slopify was closed while this run was in progress. Check its video in Projects; the next run will go ahead as planned.",
): number {
  return transact(db, () => {
    const pending = db
      .prepare(
        `SELECT id,request_id FROM schedule_runs
         WHERE status='running' AND request_id IS NOT NULL AND project_ids_json='[]'`,
      )
      .all()
      .map((row) => z.object({ id: z.string(), request_id: z.string() }).parse(row));
    for (const row of pending) {
      const receipt = readStartReceipt(db, row.request_id);
      if (receipt === undefined || receipt.result.requestId !== row.request_id) continue;
      db.prepare(
        `UPDATE schedule_runs SET project_ids_json=?
         WHERE id=? AND status='running' AND request_id=? AND project_ids_json='[]'`,
      ).run(JSON.stringify(receipt.result.projectIds), row.id, row.request_id);
    }
    const admitted = db
      .prepare(
        `SELECT project_ids_json FROM schedule_runs
         WHERE status='running' AND json_array_length(project_ids_json)>0`,
      )
      .all()
      .flatMap((row) => {
        const parsed = z.object({ project_ids_json: z.string() }).parse(row);
        return z.array(z.string()).parse(JSON.parse(parsed.project_ids_json));
      });
    const changed = db
      .prepare("UPDATE schedule_runs SET status='failed',ended_at=?,error=? WHERE status='running'")
      .run(endedAt, error);
    for (const projectId of admitted) settleScheduleRunsForProject(db, projectId, endedAt);
    return Number(changed.changes);
  });
}

function parseSchedule(row: unknown): ScheduleSummary {
  const value = rowSchema.parse(row);
  return scheduleSummarySchema.parse({
    id: value.id,
    name: value.name,
    templateId: value.template_id,
    templateVersion: value.template_version,
    cadence: JSON.parse(value.cadence_json),
    timezone: value.timezone,
    missedPolicy: value.missed_policy,
    overlapPolicy: value.overlap_policy,
    spendLimitCents: value.spend_limit_cents,
    items: JSON.parse(value.items_json),
    topicKeyword: value.topic_keyword,
    values: JSON.parse(value.values_json),
    status: value.status,
    version: value.version,
    nextRunAt: value.next_run_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
    deletedAt: value.deleted_at,
  });
}

function parseRun(row: unknown): ScheduleRun {
  const value = z
    .object({
      id: z.string(),
      schedule_id: z.string(),
      scheduled_for: z.string(),
      status: z.string(),
      request_id: z.string().nullable(),
      project_ids_json: z.string(),
      estimate_json: z.string().nullable(),
      started_at: z.string(),
      ended_at: z.string().nullable(),
      error: z.string().nullable(),
    })
    .parse(row);
  return scheduleRunSchema.parse({
    id: value.id,
    scheduleId: value.schedule_id,
    scheduledFor: value.scheduled_for,
    status: value.status,
    requestId: value.request_id,
    projectIds: JSON.parse(value.project_ids_json),
    estimate: value.estimate_json === null ? null : JSON.parse(value.estimate_json),
    startedAt: value.started_at,
    endedAt: value.ended_at,
    error: value.error === null ? null : runErrorText(value.error),
  });
}

// A failed dispatch records the refusal's reason code; the run history shows the sentence.
// Mapped on read so runs recorded before these sentences existed read the same way.
const internalRunError =
  "Slopify hit an internal error while starting this run. The next run will try again; if it keeps happening, use Download diagnostics in Settings and report it.";
const runErrors: Readonly<Record<string, string>> = {
  "missing-template":
    "The template this schedule uses was deleted or changed. Edit the schedule and choose a template again.",
  "unsupported-media":
    "This template uses audio, images or a thumbnail you supplied, which scheduled runs cannot use. Pick a template that generates these instead.",
  "spend-limit":
    "Not started: the estimated cost was above this schedule's spend limit, or some prices were unknown. Raise the spend limit or choose models with known prices.",
  readiness:
    "Not started: a provider was not ready, for example a missing API key, model or voice. Check Settings → Providers; the next run will try again.",
  "not-found":
    "The template's settings are no longer valid, for example a prompt or voice it uses was deleted. Fix the template in Library > Templates and save it.",
  "invalid-draft":
    "The template's settings are no longer valid, for example a prompt or voice it uses was deleted. Fix the template in Library > Templates and save it.",
  "invalid-edit":
    "The template's settings are no longer valid, for example a prompt or voice it uses was deleted. Fix the template in Library > Templates and save it.",
  conflict: internalRunError,
  "pending-start": internalRunError,
  "already-started": internalRunError,
  "stale-review": internalRunError,
  "The scheduled run failed.": internalRunError,
};
function runErrorText(error: string): string {
  return Object.hasOwn(runErrors, error) ? (runErrors[error] ?? error) : error;
}
