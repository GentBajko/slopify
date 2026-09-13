import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
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
  status: z.string(),
  version: z.number(),
  next_run_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

export function scheduleById(db: DatabaseSync, id: string): ScheduleSummary | undefined {
  const row = db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,status,version,next_run_at,created_at,updated_at
       FROM schedules WHERE id=?`,
    )
    .get(id);
  return row === undefined ? undefined : parseSchedule(row);
}

export function scheduleRows(db: DatabaseSync): readonly ScheduleSummary[] {
  return db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,status,version,next_run_at,created_at,updated_at
       FROM schedules ORDER BY created_at DESC,id`,
    )
    .all()
    .map(parseSchedule);
}

export function dueSchedules(db: DatabaseSync, now: string): readonly ScheduleSummary[] {
  return db
    .prepare(
      `SELECT id,name,template_id,template_version,cadence_json,timezone,missed_policy,
       overlap_policy,spend_limit_cents,items_json,status,version,next_run_at,created_at,updated_at
       FROM schedules WHERE status='active' AND next_run_at IS NOT NULL AND next_run_at <= ?
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
       spend_limit_cents,items_json,status,version,creation_hash,next_run_at,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
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
    schedule.status,
    schedule.version,
    creationHash,
    schedule.nextRunAt,
    schedule.createdAt,
    schedule.updatedAt,
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
       missed_policy=?,overlap_policy=?,spend_limit_cents=?,items_json=?,status=?,version=?,
       next_run_at=?,updated_at=?,mutation_id=?,mutation_hash=?
       WHERE id=? AND version=?`,
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

export function deleteScheduleRow(db: DatabaseSync, id: string, version: number): boolean {
  const changed = db.prepare("DELETE FROM schedules WHERE id=? AND version=?").run(id, version);
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
      "UPDATE schedules SET status=?,next_run_at=?,version=version+1,updated_at=? WHERE id=? AND version=?",
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

export function runsForSchedule(db: DatabaseSync, scheduleId: string): readonly ScheduleRun[] {
  return db
    .prepare(
      `SELECT id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,
       started_at,ended_at,error FROM schedule_runs WHERE schedule_id=? ORDER BY started_at DESC,id DESC`,
    )
    .all(scheduleId)
    .map(parseRun);
}

export function activeRun(db: DatabaseSync, scheduleId: string): boolean {
  return (
    db
      .prepare("SELECT 1 FROM schedule_runs WHERE schedule_id=? AND status='running' LIMIT 1")
      .get(scheduleId) !== undefined
  );
}

export function recoverRunningRuns(db: DatabaseSync, endedAt: string): number {
  const changed = db
    .prepare("UPDATE schedule_runs SET status='failed',ended_at=?,error=? WHERE status='running'")
    .run(endedAt, "The app stopped while this scheduled run was active.");
  return Number(changed.changes);
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
    status: value.status,
    version: value.version,
    nextRunAt: value.next_run_at,
    createdAt: value.created_at,
    updatedAt: value.updated_at,
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
    error: value.error,
  });
}
