import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log, LogFields, LogLevel } from "../../kernel/log.js";
import type { StageKind } from "../../kernel/pipeline.js";
import { stageKinds } from "../../kernel/pipeline.js";
import type { AudioSegment, TelemetryCounters, TelemetryEventType } from "./model.js";
import { audioSegments, telemetryEventTypes } from "./model.js";
import type { TelemetryDeps } from "./record.js";
import { record, writeEvent } from "./record.js";
import { insertMachine, undeliveredEvents } from "./repo.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

interface Line {
  readonly level: LogLevel;
  readonly event: string;
  readonly detail: string | undefined;
}

interface Harness {
  readonly deps: TelemetryDeps;
  readonly db: DatabaseSync;
  readonly lines: Line[];
}

function harness(ids: Ids = counter()): Harness {
  const db = openDb(":memory:");
  migrate(db, clock);
  const lines: Line[] = [];
  const log: Log = {
    write: (level: LogLevel, event: string, fields?: LogFields): void => {
      lines.push({ level, event, detail: fields?.detail });
    },
  };
  return { deps: { db, ids, clock, log, appVersion: "1.2.3" }, db, lines };
}

function counter(): Ids {
  let n = 0;
  return {
    next: (): string => {
      n += 1;
      return `e${n}`;
    },
  };
}

function seen(db: DatabaseSync): void {
  insertMachine(db, {
    machineId: "7b1f0d2e-0000-4000-8000-000000000000",
    noticeSeenAt: "2026-09-02T09:00:00.000Z",
    appVersion: "1.2.3",
  });
}

// A Record keyed by the union: a stage added in a later step cannot be recorded until it
// appears here, which is what keeps the sweep below honest.
const perType: Readonly<Record<TelemetryEventType, TelemetryCounters>> = {
  install: {},
  "project.created": {},
  "stage.completed": {
    stage: "audio",
    segment: "body",
    provider: "elevenlabs",
    model: "eleven_v3",
    tokensIn: 10,
    tokensOut: 20,
    audioSeconds: 12.5,
    images: 3,
    thumbnails: 1,
  },
};

describe("record", () => {
  it("writes the event with the app version merged into its counters", () => {
    const { deps, db } = harness();
    seen(db);

    record(deps, "stage.completed", { stage: "video" });

    expect(undeliveredEvents(db, 10)).toEqual([
      {
        id: "e1",
        type: "stage.completed",
        payload: { appVersion: "1.2.3", stage: "video" },
        createdAt: "2026-09-02T10:00:00.000Z",
        deliveredAt: null,
      },
    ]);
  });

  // logic/16 step 1: the notice is the promise, and it has not been made yet.
  it("records nothing before the notice created the machine id", () => {
    const { deps, db } = harness();

    record(deps, "stage.completed", { stage: "video" });

    expect(undeliveredEvents(db, 10)).toEqual([]);
  });

  it("records the install event that creates the machine id", () => {
    const { deps, db } = harness();

    record(deps, "install", {});

    expect(undeliveredEvents(db, 10).map((row) => row.type)).toEqual(["install"]);
  });

  it("logs and swallows a payload the schema refuses", () => {
    const { deps, db, lines } = harness();
    seen(db);

    // The compiler bars this at every real call site; the cast is the test standing in
    // for a future stage that reached for a field it should not have.
    record(deps, "stage.completed", { title: "Rope Tricks" } as TelemetryCounters);

    expect(undeliveredEvents(db, 10)).toEqual([]);
    expect(lines.map((line) => line.level)).toEqual(["warn"]);
    expect(lines[0]?.event).toBe("telemetry.record");
  });

  it("logs and swallows a failing write rather than failing its caller", () => {
    const { deps, db, lines } = harness({ next: () => "same" });
    seen(db);

    record(deps, "project.created", {});
    record(deps, "project.created", {});

    expect(undeliveredEvents(db, 10).map((row) => row.id)).toEqual(["same"]);
    expect(lines.map((line) => line.event)).toEqual(["telemetry.record"]);
  });

  it("never lets a provider key reach the log line either", () => {
    const { deps, db, lines } = harness();
    seen(db);

    record(deps, "stage.completed", { key: "sk-live-0123456789abcdef" } as TelemetryCounters);

    expect(lines[0]?.detail).not.toContain("sk-live-0123456789abcdef");
  });

  // The guard the step exists for: whatever a caller passes, what lands in the row is
  // only ever a key from the allow-list in model.ts.
  it.each(telemetryEventTypes)("keeps %s inside the allowed key set", (type) => {
    const { deps, db } = harness();
    seen(db);

    record(deps, type, perType[type]);

    const rows = undeliveredEvents(db, 10);
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0]?.payload ?? {}).toSorted()).toEqual(
      ["appVersion", ...Object.keys(perType[type])].toSorted(),
    );
  });

  // The second half of the sweep. logic/16 step 2 counts per stage and, for the three
  // units that are not a whole stage, per segment, so the pair is part of the privacy
  // surface: a stage kind or a segment added later cannot be recorded until it appears in
  // one of the two unions below, and whatever it carries still leaves only allowed keys.
  it.each(units())("keeps %s/%s inside the allowed key set", (stage, segment) => {
    const { deps, db } = harness();
    seen(db);

    record(deps, "stage.completed", {
      stage,
      ...(segment === undefined ? {} : { segment }),
      ...everyCounter,
    });

    const payload = undeliveredEvents(db, 10)[0]?.payload ?? {};
    expect(Object.keys(payload).toSorted()).toEqual(
      [
        "appVersion",
        "stage",
        ...(segment === undefined ? [] : ["segment"]),
        ...Object.keys(everyCounter),
      ].toSorted(),
    );
    // Nothing free-text but the two provider names logic/16 step 3 asks for, both capped
    // by the schema; every other value is a number.
    expect(
      Object.entries(payload)
        .filter(([, value]) => typeof value === "string")
        .map(([key]) => key)
        .toSorted(),
    ).toEqual(
      ["appVersion", "model", "provider", ...(segment === undefined ? [] : ["segment"])]
        .concat("stage")
        .toSorted(),
    );
  });
});

// Every counter of logic/16 step 3 at once, which is more than any one unit records: the
// sweep is about which keys can reach a row, not about which combination is realistic.
const everyCounter: TelemetryCounters = {
  provider: "elevenlabs",
  model: "eleven_v3",
  tokensIn: 10,
  tokensOut: 20,
  audioSeconds: 12.5,
  images: 3,
  thumbnails: 1,
};

function units(): (readonly [StageKind, AudioSegment | undefined])[] {
  return stageKinds.flatMap((stage) =>
    [undefined, ...audioSegments].map((segment) => [stage, segment] as const),
  );
}

describe("writeEvent", () => {
  // The one caller that must not swallow: the notice dismissal writes the machine row and
  // the install event in one transaction, so a failure has to unwind it.
  it("throws on a refused payload", () => {
    const { deps, db } = harness();
    seen(db);

    expect(() => writeEvent(deps, "stage.completed", { os: "linux" } as TelemetryCounters)).toThrow(
      /os/,
    );
  });
});
