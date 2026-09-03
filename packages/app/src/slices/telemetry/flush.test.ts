import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import type { Clock } from "../../kernel/clock.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import type { CollectorEvent, PostOutcome } from "./collector-client.js";
import type { FlushDeps, Flusher } from "./flush.js";
import { batchSize, createFlusher, flush } from "./flush.js";
import { insertMachine, insertTelemetryEvent, undeliveredEvents } from "./repo.js";

const clock: Clock = { now: () => new Date("2026-09-02T11:00:00.000Z") };
const machineId = "7b1f0d2e-0000-4000-8000-000000000000";

interface Line {
  readonly level: LogLevel;
  readonly event: string;
  readonly detail: string | undefined;
}

interface Harness {
  readonly deps: FlushDeps;
  readonly db: DatabaseSync;
  readonly posted: CollectorEvent[][];
  readonly lines: Line[];
}

function harness(
  answer: (n: number) => PostOutcome = () => ({ ok: true }),
  options: { readonly seen: boolean } = { seen: true },
): Harness {
  const db = openDb(":memory:");
  migrate(db, clock);
  if (options.seen) {
    insertMachine(db, { machineId, noticeSeenAt: "2026-09-02T09:00:00.000Z", appVersion: "1.2.3" });
  }
  const posted: CollectorEvent[][] = [];
  const lines: Line[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push({ level, event, detail: fields?.detail });
    },
  };
  return {
    db,
    posted,
    lines,
    deps: {
      db,
      clock,
      log,
      post: async (events): Promise<PostOutcome> => {
        posted.push([...events]);
        return answer(posted.length);
      },
    },
  };
}

function queue(db: DatabaseSync, count: number, from = 1): void {
  for (let n = from; n < from + count; n += 1) {
    insertTelemetryEvent(db, {
      id: `e${String(n).padStart(4, "0")}`,
      type: "stage.completed",
      payload: { appVersion: "1.2.3", stage: "video" },
      createdAt: "2026-09-02T10:00:00.000Z",
      deliveredAt: null,
    });
  }
}

describe("flush", () => {
  it("sends the queue with the machine id and marks it delivered", async () => {
    const { deps, db, posted } = harness();
    queue(db, 2);

    expect(await flush(deps)).toEqual({ delivered: 2, dropped: 0 });

    expect(posted).toEqual([
      [
        {
          id: "e0001",
          machineId,
          type: "stage.completed",
          payload: { appVersion: "1.2.3", stage: "video" },
          createdAt: "2026-09-02T10:00:00.000Z",
        },
        {
          id: "e0002",
          machineId,
          type: "stage.completed",
          payload: { appVersion: "1.2.3", stage: "video" },
          createdAt: "2026-09-02T10:00:00.000Z",
        },
      ],
    ]);
    expect(undeliveredEvents(db, 10)).toEqual([]);
    expect(
      db.prepare("SELECT delivered_at FROM telemetry_events WHERE id = 'e0001'").get(),
    ).toEqual({ delivered_at: "2026-09-02T11:00:00.000Z" });
  });

  // logic/16 step 1: nothing is sent before the notice created the machine id.
  it("sends nothing when the notice has not been dismissed", async () => {
    const { deps, db, posted } = harness(() => ({ ok: true }), { seen: false });
    db.prepare(
      "INSERT INTO telemetry_events (id, type, payload, created_at) VALUES ('e1','install','{\"appVersion\":\"1.2.3\"}','2026-09-02')",
    ).run();

    expect(await flush(deps)).toEqual({ delivered: 0, dropped: 0 });
    expect(posted).toEqual([]);
    expect(undeliveredEvents(db, 10)).toHaveLength(1);
  });

  it("does not call the collector when the queue is empty", async () => {
    const { deps, posted } = harness();

    expect(await flush(deps)).toEqual({ delivered: 0, dropped: 0 });
    expect(posted).toEqual([]);
  });

  it("leaves the queue alone when the collector is unreachable", async () => {
    const { deps, db, lines } = harness(() => ({
      ok: false,
      retriable: true,
      reason: "fetch failed",
    }));
    queue(db, 2);

    expect(await flush(deps)).toEqual({ delivered: 0, dropped: 0 });
    expect(undeliveredEvents(db, 10)).toHaveLength(2);
    // Offline is not a fault the user hears about: nothing is logged above info.
    expect(lines.every((line) => line.level === "info")).toBe(true);
  });

  it("drops a batch the collector refuses, so the queue cannot wedge", async () => {
    const { deps, db, lines } = harness(() => ({
      ok: false,
      retriable: false,
      reason: "the collector answered 400",
    }));
    queue(db, 2);

    expect(await flush(deps)).toEqual({ delivered: 0, dropped: 2 });
    expect(undeliveredEvents(db, 10)).toEqual([]);
    expect(lines.map((line) => line.level)).toContain("warn");
  });

  it("keeps going batch by batch until the queue is empty", async () => {
    const { deps, db, posted } = harness();
    queue(db, batchSize + 3);

    expect(await flush(deps)).toEqual({ delivered: batchSize + 3, dropped: 0 });
    expect(posted.map((batch) => batch.length)).toEqual([batchSize, 3]);
  });

  it("stops at the first batch the collector cannot take", async () => {
    const { deps, db, posted } = harness((n) =>
      n === 1 ? { ok: true } : { ok: false, retriable: true, reason: "fetch failed" },
    );
    queue(db, batchSize + 3);

    expect(await flush(deps)).toEqual({ delivered: batchSize, dropped: 0 });
    expect(posted).toHaveLength(2);
    expect(undeliveredEvents(db, 10)).toHaveLength(3);
  });
});

describe("createFlusher", () => {
  it("coalesces a burst of records into one flush", async () => {
    const { deps, db, posted } = harness();
    queue(db, 3);
    const flusher = createFlusher(deps, 1);

    flusher.soon();
    flusher.soon();
    flusher.soon();
    await vi.waitFor(() => expect(posted).toHaveLength(1));

    expect(posted[0]).toHaveLength(3);
    flusher.stop();
  });

  it("flushes again for what was recorded while a flush was in flight", async () => {
    const { deps, db, posted } = harness();
    queue(db, 1);
    let flusher: Flusher | undefined;
    const inflight: FlushDeps = {
      ...deps,
      post: async (events) => {
        const outcome = await deps.post(events);
        if (posted.length === 1) {
          // A stage finishes while the first post is still open.
          queue(db, 1, 2);
          flusher?.soon();
        }
        return outcome;
      },
    };
    flusher = createFlusher(inflight, 1);

    flusher.soon();
    await vi.waitFor(() => expect(posted).toHaveLength(2));

    expect(posted.map((batch) => batch.map((event) => event.id))).toEqual([["e0001"], ["e0002"]]);
    flusher.stop();
  });

  it("cancels a pending flush when the app stops", async () => {
    const { deps, db, posted } = harness();
    queue(db, 1);
    const flusher = createFlusher(deps, 50);

    flusher.soon();
    flusher.stop();
    flusher.soon();
    await new Promise((resolve) => setTimeout(resolve, 120));

    expect(posted).toEqual([]);
  });

  it("logs and swallows a flush that throws rather than crashing the timer", async () => {
    const { deps, db, lines } = harness();
    const broken: FlushDeps = {
      ...deps,
      post: () => {
        throw new Error("the collector client is broken");
      },
    };
    queue(db, 1);
    const flusher = createFlusher(broken, 1);

    flusher.soon();
    await vi.waitFor(() =>
      expect(lines.some((line) => line.event === "telemetry.flush")).toBe(true),
    );

    expect(lines.find((line) => line.event === "telemetry.flush")?.level).toBe("warn");
    flusher.stop();
  });
});
