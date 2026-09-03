import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { TelemetryEvent } from "./model.js";
import {
  insertMachine,
  insertTelemetryEvent,
  machineOf,
  markDelivered,
  undeliveredEvents,
} from "./repo.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  return db;
}

function event(id: string, overrides: Partial<TelemetryEvent> = {}): TelemetryEvent {
  return {
    id,
    type: "stage.completed",
    payload: { appVersion: "1.2.3", stage: "video" },
    createdAt: "2026-09-02T10:00:00.000Z",
    deliveredAt: null,
    ...overrides,
  };
}

describe("the telemetry queue", () => {
  it("reads back an event with its payload as an object, not a string", () => {
    const db = migrated();
    insertTelemetryEvent(db, event("e1"));

    expect(undeliveredEvents(db, 10)).toEqual([event("e1")]);
  });

  it("returns the oldest events first, up to the batch size", () => {
    const db = migrated();
    for (const id of ["e1", "e2", "e3"]) {
      insertTelemetryEvent(db, event(id));
    }

    expect(undeliveredEvents(db, 2).map((row) => row.id)).toEqual(["e1", "e2"]);
  });

  it("leaves a delivered event out of the next batch", () => {
    const db = migrated();
    insertTelemetryEvent(db, event("e1"));
    insertTelemetryEvent(db, event("e2"));

    markDelivered(db, ["e1"], "2026-09-02T11:00:00.000Z");

    expect(undeliveredEvents(db, 10).map((row) => row.id)).toEqual(["e2"]);
    expect(db.prepare("SELECT delivered_at FROM telemetry_events WHERE id = 'e1'").get()).toEqual({
      delivered_at: "2026-09-02T11:00:00.000Z",
    });
  });

  it("marks nothing when the id list is empty", () => {
    const db = migrated();
    insertTelemetryEvent(db, event("e1"));

    markDelivered(db, [], "2026-09-02T11:00:00.000Z");

    expect(undeliveredEvents(db, 10).map((row) => row.id)).toEqual(["e1"]);
  });

  it("keeps the first write when the same event id is inserted twice", () => {
    const db = migrated();
    insertTelemetryEvent(db, event("e1"));

    expect(() => {
      insertTelemetryEvent(db, event("e1"));
    }).toThrow();
  });
});

describe("the machine row", () => {
  it("is absent until it is written", () => {
    expect(machineOf(migrated())).toBeUndefined();
  });

  it("reads back in camelCase", () => {
    const db = migrated();
    insertMachine(db, {
      machineId: "7b1f",
      noticeSeenAt: "2026-09-02T10:00:00.000Z",
      appVersion: "1.2.3",
    });

    expect(machineOf(db)).toEqual({
      machineId: "7b1f",
      noticeSeenAt: "2026-09-02T10:00:00.000Z",
      appVersion: "1.2.3",
    });
  });
});
