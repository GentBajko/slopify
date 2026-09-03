import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { dismissNotice, noticeSeen } from "./machine.js";
import type { TelemetryDeps } from "./record.js";
import { undeliveredEvents } from "./repo.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function harness(): { readonly deps: TelemetryDeps; readonly db: DatabaseSync } {
  const db = openDb(":memory:");
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `e${n}`;
    },
  };
  return { deps: { db, ids, clock, log, appVersion: "1.2.3" }, db };
}

describe("dismissNotice", () => {
  it("creates a random machine id, marks the machine seen, and records the install", () => {
    const { deps, db } = harness();

    const machine = dismissNotice(deps);

    expect(machine.machineId).toMatch(uuid);
    expect(machine.noticeSeenAt).toBe("2026-09-02T10:00:00.000Z");
    expect(machine.appVersion).toBe("1.2.3");
    expect(undeliveredEvents(db, 10)).toEqual([
      {
        id: "e1",
        type: "install",
        payload: { appVersion: "1.2.3" },
        createdAt: "2026-09-02T10:00:00.000Z",
        deliveredAt: null,
      },
    ]);
  });

  it("is idempotent: a second dismissal keeps the id and records no second install", () => {
    const { deps, db } = harness();

    const first = dismissNotice(deps);
    const second = dismissNotice(deps);

    expect(second).toEqual(first);
    expect(undeliveredEvents(db, 10).map((row) => row.type)).toEqual(["install"]);
  });

  it("leaves no machine row behind when the install event cannot be written", () => {
    const { deps, db } = harness();
    // One id for the machine and one for the event; a repeated id makes the second write
    // fail, which must unwind the first.
    const broken: TelemetryDeps = { ...deps, ids: { next: () => "same" } };
    db.prepare(
      "INSERT INTO telemetry_events (id, type, payload, created_at) VALUES ('same', 'install', '{}', '2026-09-01')",
    ).run();

    expect(() => dismissNotice(broken)).toThrow();
    expect(noticeSeen(db)).toBe(false);
  });
});

describe("noticeSeen", () => {
  it("is false until the notice is dismissed", () => {
    const { deps, db } = harness();

    expect(noticeSeen(db)).toBe(false);
    dismissNotice(deps);
    expect(noticeSeen(db)).toBe(true);
  });
});
