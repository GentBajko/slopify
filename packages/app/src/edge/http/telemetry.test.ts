import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { Ids } from "../../kernel/ids.js";
import type { Log } from "../../kernel/log.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { undeliveredEvents } from "../../slices/telemetry/repo.js";
import { createHub } from "../events/hub.js";
import { createApp } from "./app.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");
const log: Log = { write: (): void => {} };

interface Harness {
  readonly app: ReturnType<typeof createApp>;
  readonly db: DatabaseSync;
  readonly flushes: number[];
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-telemetry-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${n}`;
    },
  };
  const flushes: number[] = [];
  const app = createApp({
    db,
    paths,
    hub: createHub({ ids, log }),
    runner: {
      tick: (): void => {},
      settled: async (): Promise<void> => {},
      abortProject: async (): Promise<void> => {},
      abortAll: async (): Promise<void> => {},
    },
    clock,
    ids,
    log,
    version: "1.2.3",
    webDist: join(paths.dataDir, "missing"),
    // These routes never probe; the CLI status routes carry their own harness.
    probe: () => Promise.resolve({ ran: false, stdout: "" }),
    flushSoon: (): void => {
      flushes.push(flushes.length);
    },
  });
  return { app, db, flushes };
}

describe("GET /api/telemetry/notice", () => {
  it("says the notice has not been seen on a fresh install", async () => {
    const { app } = harness();

    const response = await app.request("/api/telemetry/notice");

    expect(response.status).toBe(200);
    // The version comes with the answer: the notice promises that this number goes out
    // in every report, and the promise has to name the number it is true of.
    expect(await response.json()).toEqual({ seen: false, appVersion: "1.2.3" });
  });

  it("says it has been seen once it is dismissed", async () => {
    const { app } = harness();
    await app.request("/api/telemetry/notice", { method: "POST" });

    expect(await (await app.request("/api/telemetry/notice")).json()).toEqual({
      seen: true,
      appVersion: "1.2.3",
    });
  });
});

describe("POST /api/telemetry/notice", () => {
  it("creates the machine id, records the install, and asks for a flush", async () => {
    const { app, db, flushes } = harness();

    const response = await app.request("/api/telemetry/notice", { method: "POST" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ seen: true, appVersion: "1.2.3" });
    expect(undeliveredEvents(db, 10).map((event) => event.type)).toEqual(["install"]);
    expect(db.prepare("SELECT count(*) AS n FROM machine").get()).toEqual({ n: 1 });
    expect(flushes).toHaveLength(1);
  });

  // The user can press Got it once, but a page reload mid-request or a second tab must
  // not mint a second machine or a second install event.
  it("is idempotent", async () => {
    const { app, db } = harness();

    await app.request("/api/telemetry/notice", { method: "POST" });
    const again = await app.request("/api/telemetry/notice", { method: "POST" });

    expect(again.status).toBe(200);
    expect(undeliveredEvents(db, 10)).toHaveLength(1);
    expect(db.prepare("SELECT count(*) AS n FROM machine").get()).toEqual({ n: 1 });
  });

  // The machine id is the one identifier this app has. It is not something the page needs
  // and it is not something an answer should carry around.
  it("never answers with the machine id", async () => {
    const { app } = harness();

    const body = await (await app.request("/api/telemetry/notice", { method: "POST" })).text();

    expect(body).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}/);
  });
});
