import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { transact } from "../../kernel/db/tx.js";
import type { Machine } from "./model.js";
import type { TelemetryDeps } from "./record.js";
import { writeEvent } from "./record.js";
import { insertMachine, machineOf } from "./repo.js";

// The notice is shown when no machine id exists.
export function noticeSeen(db: DatabaseSync): boolean {
  return machineOf(db) !== undefined;
}

// The id is created when the user dismisses the notice, never at boot, so nothing is collected
// before the promise about what is collected has been made. Deleting the data directory makes a
// new install; there is no reset control and no opt-out.
export function dismissNotice(deps: TelemetryDeps): Machine {
  const existing = machineOf(deps.db);
  if (existing !== undefined) {
    return existing;
  }
  // Not the ULID generator the rest of the app uses: a ULID is sortable and carries the
  // millisecond it was made, so a machine id built from one would order every install by
  // install time and leak it to the collector. This one is random and nothing else.
  const machine: Machine = {
    machineId: randomUUID(),
    noticeSeenAt: deps.clock.now().toISOString(),
    appVersion: deps.appVersion,
  };
  transact(deps.db, () => {
    insertMachine(deps.db, machine);
    // Exactly one install event per machine. Written in the same transaction as the row that
    // makes it unique, so a machine cannot exist without it.
    writeEvent(deps, "install", {});
  });
  return machine;
}
