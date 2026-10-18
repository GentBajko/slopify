/// <reference lib="esnext.temporal" />

import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";

// The one sample job each design template keeps (`design_template_samples`), and what the
// samples spent today against their daily budget.

export const sampleStates = ["queued", "making", "done", "failed", "held"] as const;
export type SampleState = (typeof sampleStates)[number];

export interface SampleRow {
  readonly templateId: string;
  readonly designId: string | null;
  readonly version: number;
  readonly state: SampleState;
  // Why a sample waits for the person (held) or what went wrong (failed).
  readonly heldReason: string | null;
  // The quote the job was accepted at; it may spend up to this.
  readonly quotedHigh: number | null;
  readonly updatedAt: string;
}

const rowSchema = z.object({
  template_id: z.string(),
  design_id: z.string().nullable(),
  version: z.number(),
  state: z.enum(sampleStates),
  held_reason: z.string().nullable(),
  quoted_high: z.number().nullable(),
  updated_at: z.string(),
});

export function sampleRow(db: DatabaseSync, templateId: string): SampleRow | undefined {
  const raw = db
    .prepare("SELECT * FROM design_template_samples WHERE template_id=?")
    .get(templateId);
  if (raw === undefined) return undefined;
  const row = rowSchema.parse(raw);
  return {
    templateId: row.template_id,
    designId: row.design_id,
    version: row.version,
    state: row.state,
    heldReason: row.held_reason,
    quotedHigh: row.quoted_high,
    updatedAt: row.updated_at,
  };
}

export function sampleRowOfDesign(db: DatabaseSync, designId: string): SampleRow | undefined {
  const raw = db
    .prepare("SELECT template_id FROM design_template_samples WHERE design_id=?")
    .get(designId);
  return raw === undefined ? undefined : sampleRow(db, String(raw.template_id));
}

export function queuedTemplates(db: DatabaseSync): readonly string[] {
  return db
    .prepare(
      "SELECT template_id FROM design_template_samples WHERE state='queued' ORDER BY updated_at",
    )
    .all()
    .map((row) => String(row.template_id));
}

export function makingTemplates(db: DatabaseSync): readonly string[] {
  return db
    .prepare("SELECT template_id FROM design_template_samples WHERE state='making'")
    .all()
    .map((row) => String(row.template_id));
}

export function writeSample(db: DatabaseSync, row: SampleRow): void {
  db.prepare(
    `INSERT INTO design_template_samples (template_id,design_id,version,state,held_reason,quoted_high,updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(template_id) DO UPDATE SET design_id=excluded.design_id, version=excluded.version,
       state=excluded.state, held_reason=excluded.held_reason, quoted_high=excluded.quoted_high,
       updated_at=excluded.updated_at`,
  ).run(
    row.templateId,
    row.designId,
    row.version,
    row.state,
    row.heldReason,
    row.quotedHigh,
    row.updatedAt,
  );
}

// Local midnight of `now` in `timeZone`, as an instant.
export function startOfDay(now: Date, timeZone: string): string {
  const day = Temporal.Instant.fromEpochMilliseconds(now.valueOf())
    .toZonedDateTimeISO(timeZone)
    .toPlainDate();
  return new Date(day.toZonedDateTime({ timeZone }).epochMilliseconds).toISOString();
}

// What every template's samples cost since local midnight, in dollars. Plan usage costs 0.
export function sampleSpentToday(db: DatabaseSync, now: Date, timeZone: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(u.cost), 0) AS spent FROM standalone_usage AS u
       JOIN designs AS d ON d.id = u.owner_id
       WHERE u.owner_kind='design' AND d.sample_of IS NOT NULL AND u.created_at >= ?`,
    )
    .get(startOfDay(now, timeZone));
  return Number(row?.spent ?? 0);
}

// What samples queued or being made will cost: each one's quoted price, before any of it is
// spent. A template's own sample is left out, unless its picture is being made now.
export function sampleReserved(db: DatabaseSync, templateId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(quoted_high), 0) AS reserved FROM design_template_samples
       WHERE (state IN ('queued','making') AND template_id IS NOT ?)
          OR (state='making' AND template_id=?)`,
    )
    .get(templateId, templateId);
  return Number(row?.reserved ?? 0);
}

// Earlier samples of a template, kept until the day they were made is over so today's spend
// still counts them; then removed with their pictures' renders by the caller.
export function oldSamples(
  db: DatabaseSync,
  templateId: string,
  keep: string | null,
  before: string,
): readonly string[] {
  return db
    .prepare(
      `SELECT id FROM designs WHERE sample_of=? AND id IS NOT ? AND created_at < ?
       AND NOT EXISTS (SELECT 1 FROM design_steps WHERE design_id=designs.id AND state='making')`,
    )
    .all(templateId, keep, before)
    .map((row) => String(row.id));
}
