import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import type { TelemetryCounters, TelemetryEvent, TelemetryEventType } from "./model.js";
import { payloadSchema } from "./model.js";
import { insertTelemetryEvent, machineOf } from "./repo.js";

export interface TelemetryDeps {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly clock: Clock;
  readonly log: Log;
  readonly appVersion: string;
}

// Appends one row to the local queue and hands it back. Throws: the notice dismissal
// needs the machine row and the install event to land together or not at all. Pipeline
// callers use `record` below instead.
export function writeEvent(
  deps: TelemetryDeps,
  type: TelemetryEventType,
  counters: TelemetryCounters,
): TelemetryEvent {
  const event: TelemetryEvent = {
    id: deps.ids.next(),
    type,
    // Strict: the payload is checked against the allow-list before it is written, so a
    // caller cannot widen what leaves this machine by passing an extra field.
    payload: payloadSchema.parse({ appVersion: deps.appVersion, ...counters }),
    createdAt: deps.clock.now().toISOString(),
    deliveredAt: null,
  };
  insertTelemetryEvent(deps.db, event);
  return event;
}

// Telemetry never blocks and never fails a pipeline stage. This is the one place in the
// codebase where an error is swallowed rather than propagated - a failure to count a finished
// render must not undo the render. It is logged, so the failure is still visible in
// <data-dir>/logs, and nothing else in this module catches.
export function record(
  deps: TelemetryDeps,
  type: TelemetryEventType,
  counters: TelemetryCounters,
): void {
  try {
    // A machine id exists for every event except the install event that creates it. Before
    // the notice is dismissed nothing is written, so nothing about a run the user has not
    // been told about can ever be sent.
    if (type !== "install" && machineOf(deps.db) === undefined) {
      return;
    }
    writeEvent(deps, type, counters);
  } catch (error) {
    deps.log.write("warn", "telemetry.record", {
      detail: `${type}: ${messageOf(error)}`,
    });
  }
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
