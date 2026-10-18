import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { supersedeQueuedBakeoff } from "./bakeoff-repo.js";
import { type SampleJobKind, sampleJobKinds } from "./model.js";

export interface SampleJob {
  readonly templateId: string;
  readonly templateVersion: number;
  // The high estimate the person saw and accepted on Save; a sample that now costs more waits.
  readonly ackHigh: number;
  readonly kind: SampleJobKind;
  readonly requestedAt: string;
}

const jobRow = z.object({
  templateId: z.string(),
  templateVersion: z.number().int().positive(),
  ackHigh: z.number(),
  kind: z.enum(sampleJobKinds),
  requestedAt: z.string(),
});
const columns =
  "template_id AS templateId,template_version AS templateVersion,ack_high AS ackHigh,kind,requested_at AS requestedAt";

// Queues a template's sample job. A newer request takes the place of the one still queued; the
// running one is left to finish and this one waits behind it. A free-only request never takes
// the place of a queued paid one for the same version, which already makes the free samples,
// nor of a queued bake-off.
export function enqueueJob(db: DatabaseSync, job: SampleJob): void {
  transact(db, () => {
    const queued = queuedJob(db, job.templateId);
    if (
      queued !== undefined &&
      job.kind === "free" &&
      queued.kind !== "free" &&
      (queued.templateVersion === job.templateVersion || queued.kind === "bakeoff")
    )
      return;
    // A bake-off still waiting was priced on the version a paid change replaces: it is
    // dropped, saying so, and nothing was spent on it.
    if (queued?.kind === "bakeoff" && job.kind !== "bakeoff")
      supersedeQueuedBakeoff(db, job.templateId, job.requestedAt);
    db.prepare(
      `INSERT INTO template_sample_jobs (template_id,template_version,ack_high,kind,requested_at,state)
       VALUES (?,?,?,?,?,'queued')
       ON CONFLICT(template_id,state) DO UPDATE SET template_version=excluded.template_version,
         ack_high=excluded.ack_high,kind=excluded.kind,requested_at=excluded.requested_at`,
    ).run(job.templateId, job.templateVersion, job.ackHigh, job.kind, job.requestedAt);
  });
}

export function queuedJob(db: DatabaseSync, templateId: string): SampleJob | undefined {
  const row = db
    .prepare(`SELECT ${columns} FROM template_sample_jobs WHERE template_id=? AND state='queued'`)
    .get(templateId);
  return row === undefined ? undefined : jobRow.parse(row);
}

export function runningJob(db: DatabaseSync): SampleJob | undefined {
  const row = db
    .prepare(`SELECT ${columns} FROM template_sample_jobs WHERE state='running' LIMIT 1`)
    .get();
  return row === undefined ? undefined : jobRow.parse(row);
}

// The next job to make: the oldest queued one, only while no other is running anywhere, so one
// sample is made at a time across every template.
export function claimNextJob(db: DatabaseSync): SampleJob | undefined {
  return transact(db, () => {
    if (runningJob(db) !== undefined) return undefined;
    const row = db
      .prepare(
        `SELECT ${columns} FROM template_sample_jobs WHERE state='queued' ORDER BY requested_at,template_id LIMIT 1`,
      )
      .get();
    if (row === undefined) return undefined;
    const job = jobRow.parse(row);
    db.prepare(
      "UPDATE template_sample_jobs SET state='running' WHERE template_id=? AND state='queued'",
    ).run(job.templateId);
    return job;
  });
}

export function finishJob(db: DatabaseSync, templateId: string): void {
  db.prepare("DELETE FROM template_sample_jobs WHERE template_id=? AND state='running'").run(
    templateId,
  );
}

// At start: a job that was running when Slopify stopped is queued again, unless a newer one
// already waits for its template, which then takes its place.
export function recoverJobs(db: DatabaseSync): void {
  transact(db, () => {
    db.prepare(
      `DELETE FROM template_sample_jobs WHERE state='running' AND template_id IN
         (SELECT template_id FROM template_sample_jobs WHERE state='queued')`,
    ).run();
    db.prepare("UPDATE template_sample_jobs SET state='queued' WHERE state='running'").run();
  });
}
