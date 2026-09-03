import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "./kernel/clock.fake.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { readVersion } from "./kernel/version.js";
import { boot, markInterruptedStages, urlOf } from "./main.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  return db;
}

function addStage(db: DatabaseSync, id: string, state: string): void {
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, 'p1', ?, 'generate', ?)",
  ).run(id, id, state);
}

function dataDir(): string {
  return mkdtempSync(join(tmpdir(), "slopify-boot-"));
}

describe("markInterruptedStages", () => {
  it("fails every running stage and leaves the rest alone", () => {
    const db = migrated();
    db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
    addStage(db, "research", "running");
    addStage(db, "article", "running");
    addStage(db, "audio", "pending");
    addStage(db, "images", "done");
    addStage(db, "video", "canceled");

    expect(markInterruptedStages(db, clock)).toBe(2);

    expect(db.prepare("SELECT id, state, failure_reason, finished_at FROM stages").all()).toEqual([
      {
        id: "research",
        state: "failed",
        failure_reason: "interrupted",
        finished_at: "2026-09-02T10:00:00.000Z",
      },
      {
        id: "article",
        state: "failed",
        failure_reason: "interrupted",
        finished_at: "2026-09-02T10:00:00.000Z",
      },
      { id: "audio", state: "pending", failure_reason: null, finished_at: null },
      { id: "images", state: "done", failure_reason: null, finished_at: null },
      { id: "video", state: "canceled", failure_reason: null, finished_at: null },
    ]);
  });

  it("changes nothing when no stage was running", () => {
    expect(markInterruptedStages(migrated(), clock)).toBe(0);
  });
});

describe("boot", () => {
  const running: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const stop of running.splice(0)) {
      await stop();
    }
  });

  function config(dir: string, port = 0): Config {
    return { port, host: "127.0.0.1", dataDir: dir, open: false };
  }

  it("creates the tree, migrates, and logs", async () => {
    const dir = dataDir();

    const { paths, stop } = await boot(config(dir));
    running.push(stop);

    expect(existsSync(paths.db)).toBe(true);
    expect(existsSync(paths.projects)).toBe(true);
    expect(existsSync(paths.staging)).toBe(true);
    const db = openDb(paths.db);
    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([{ version: 1 }]);
    db.close();
  });

  it("serves the HTTP app at the URL it returns and stops it again", async () => {
    const { url, stop } = await boot(config(dataDir()));

    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("x-slopify-version")).toBe(readVersion());
    await stop();

    await expect(fetch(`${url}/api/health`)).rejects.toThrow();
  });

  it("releases the lock when the port is already taken", async () => {
    const dir = dataDir();
    const taken = await boot(config(dataDir()));
    running.push(taken.stop);
    const port = Number(new URL(taken.url).port);

    await expect(boot(config(dir, port))).rejects.toThrow();

    const second = await boot(config(dir));
    running.push(second.stop);
    expect(second.url).not.toBe("");
  });

  it("refuses a second instance on the same data directory", async () => {
    const dir = dataDir();
    const { stop } = await boot(config(dir));
    running.push(stop);

    await expect(boot(config(dir))).rejects.toThrow(/already running on this data directory/);
  });

  it("lets the data directory be booted again after stop", async () => {
    const dir = dataDir();

    await (await boot(config(dir))).stop();
    const { paths, stop } = await boot(config(dir));
    running.push(stop);

    expect(existsSync(paths.lock)).toBe(true);
  });
});

describe("urlOf", () => {
  it("brackets an IPv6 literal and leaves a name or IPv4 host alone", () => {
    expect(urlOf("127.0.0.1", 4242)).toBe("http://127.0.0.1:4242");
    expect(urlOf("::1", 4242)).toBe("http://[::1]:4242");
  });
});
