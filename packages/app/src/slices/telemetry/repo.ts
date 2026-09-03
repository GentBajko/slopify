import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Machine, TelemetryEvent } from "./model.js";
import { payloadSchema, telemetryEventTypes } from "./model.js";

const eventRow = z.object({
  id: z.string(),
  type: z.enum(telemetryEventTypes),
  payload: z.string(),
  created_at: z.string(),
  delivered_at: z.string().nullable(),
});

const machineRow = z.object({
  machine_id: z.string(),
  notice_seen_at: z.string().nullable(),
  app_version: z.string(),
});

export function insertTelemetryEvent(db: DatabaseSync, event: TelemetryEvent): void {
  db.prepare(
    "INSERT INTO telemetry_events (id, type, payload, created_at, delivered_at) VALUES (?, ?, ?, ?, ?)",
  ).run(event.id, event.type, JSON.stringify(event.payload), event.createdAt, event.deliveredAt);
}

// The queue in the order it was written. By rowid rather than by created_at: two events
// recorded in the same millisecond carry the same timestamp and their ULIDs are random
// within it, so a timestamp sort would hand back the install after the project it
// preceded. The collector deduplicates by id, so re-sending the head of the queue after
// an ambiguous failure is safe.
export function undeliveredEvents(db: DatabaseSync, limit: number): TelemetryEvent[] {
  return db
    .prepare("SELECT * FROM telemetry_events WHERE delivered_at IS NULL ORDER BY rowid LIMIT ?")
    .all(limit)
    .map((row) => toEvent(eventRow.parse(row)));
}

// The Usage page's totals are the sum of the whole local log, delivered or not, and that
// log is kept forever.
//
// ceiling: every row is read and folded in memory. One event per stage of one run is a
// few dozen bytes and a machine would need a hundred thousand runs to make this cost a
// page load; the upgrade is to sum the counters in SQL with json_extract.
export function allTelemetryEvents(db: DatabaseSync): TelemetryEvent[] {
  return db
    .prepare("SELECT * FROM telemetry_events ORDER BY rowid")
    .all()
    .map((row) => toEvent(eventRow.parse(row)));
}

export function markDelivered(db: DatabaseSync, ids: readonly string[], at: string): void {
  if (ids.length === 0) {
    return;
  }
  const holes = ids.map(() => "?").join(", ");
  db.prepare(`UPDATE telemetry_events SET delivered_at = ? WHERE id IN (${holes})`).run(at, ...ids);
}

// A single row, so the first one is the machine.
export function machineOf(db: DatabaseSync): Machine | undefined {
  const row = db.prepare("SELECT * FROM machine LIMIT 1").get();
  return row === undefined ? undefined : toMachine(machineRow.parse(row));
}

export function insertMachine(db: DatabaseSync, machine: Machine): void {
  db.prepare("INSERT INTO machine (machine_id, notice_seen_at, app_version) VALUES (?, ?, ?)").run(
    machine.machineId,
    machine.noticeSeenAt,
    machine.appVersion,
  );
}

function toEvent(row: z.infer<typeof eventRow>): TelemetryEvent {
  return {
    id: row.id,
    type: row.type,
    // A JSON column never reaches a caller as a string, and the payload is re-checked on
    // the way out: a row hand-edited into the database still cannot widen what is sent.
    payload: payloadSchema.parse(JSON.parse(row.payload)),
    createdAt: row.created_at,
    deliveredAt: row.delivered_at,
  };
}

function toMachine(row: z.infer<typeof machineRow>): Machine {
  return {
    machineId: row.machine_id,
    noticeSeenAt: row.notice_seen_at,
    appVersion: row.app_version,
  };
}
