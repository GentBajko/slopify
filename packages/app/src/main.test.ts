import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixedClock } from "./kernel/clock.fake.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { readVersion } from "./kernel/version.js";
import { boot, createScheduleTickLifecycle, markInterruptedStages, urlOf } from "./main.js";

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

  it("returns interrupted paused work to pending and keeps the pause after reopening", () => {
    const db = migrated();
    db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
    db.exec("INSERT INTO project_controls VALUES ('p1', 1)");
    addStage(db, "research", "running");
    expect(markInterruptedStages(db, clock)).toBe(1);
    expect(db.prepare("SELECT state, failure_reason, finished_at FROM stages").get()).toEqual({
      state: "pending",
      failure_reason: null,
      finished_at: null,
    });
    expect(db.prepare("SELECT paused FROM project_controls").get()).toEqual({ paused: 1 });
  });

  it("changes nothing when no stage was running", () => {
    expect(markInterruptedStages(migrated(), clock)).toBe(0);
  });
});

describe("schedule tick lifecycle", () => {
  it("holds the updater mutation lease for the full tick and drains it before stop resolves", async () => {
    const events: string[] = [];
    let finish = () => {};
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const ticks = createScheduleTickLifecycle({
      beginMutation: () => {
        events.push("lease");
        return () => {
          events.push("release");
        };
      },
      tick: async () => {
        events.push("tick");
        await pending;
        events.push("done");
      },
      report: () => {
        throw new Error("Unexpected schedule failure");
      },
    });

    const running = ticks.tick();
    const duplicate = ticks.tick();
    expect(events).toEqual(["lease", "tick"]);
    let stopped = false;
    const stopping = ticks.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    finish();
    await Promise.all([running, duplicate, stopping]);
    expect(events).toEqual(["lease", "tick", "done", "release"]);
    expect(stopped).toBe(true);
  });

  it("does not start a tick while updates are locked or after stopping begins", async () => {
    const tick = vi.fn(async () => undefined);
    const ticks = createScheduleTickLifecycle({
      beginMutation: () => undefined,
      tick,
      report: () => undefined,
    });

    await ticks.tick();
    await ticks.stop();
    await ticks.tick();

    expect(tick).not.toHaveBeenCalled();
  });
});

// Each case boots the whole app, and some boot it twice; on a shared Windows runner a single
// boot can take several seconds.
describe("boot", { timeout: 30_000 }, () => {
  const running: Array<() => Promise<void>> = [];

  afterEach(async () => {
    vi.unstubAllEnvs();
    for (const stop of running.splice(0)) {
      await stop();
    }
  });

  function config(dir: string, port = 0): Config {
    return { port, host: "127.0.0.1", dataDir: dir, open: false };
  }

  it("rejects a missing ffmpeg override before serving jobs and releases the lock", async () => {
    const dir = dataDir();
    vi.stubEnv("SLOPIFY_FFMPEG", join(dir, "missing", "ffmpeg.exe"));
    await expect(boot(config(dir))).rejects.toThrow(/SLOPIFY_FFMPEG/);
    expect(existsSync(join(dir, "slopify.db"))).toBe(false);
    vi.unstubAllEnvs();
    await (await boot(config(dir))).stop();
  });

  it("creates the tree, migrates, and logs", async () => {
    const dir = dataDir();

    const { paths, stop } = await boot(config(dir));
    running.push(stop);

    expect(existsSync(paths.db)).toBe(true);
    expect(existsSync(paths.projects)).toBe(true);
    expect(existsSync(paths.staging)).toBe(true);
    const db = openDb(paths.db);
    expect(db.prepare("SELECT version FROM schema_migrations").all()).toEqual([
      { version: 1 },
      { version: 2 },
      { version: 3 },
      { version: 4 },
      { version: 5 },
      { version: 6 },
      { version: 7 },
      { version: 8 },
      { version: 9 },
      { version: 10 },
      { version: 11 },
      { version: 12 },
      { version: 13 },
      { version: 14 },
      { version: 15 },
      { version: 16 },
      { version: 17 },
    ]);
    db.close();
  });

  it("leaves project files untouched until a provisional update is committed", async () => {
    const dir = dataDir();
    const orphan = join(dir, "projects", "orphan", "media.wav");
    mkdirSync(join(dir, "projects", "orphan"), { recursive: true });
    writeFileSync(orphan, "must survive a failed candidate");
    vi.stubEnv("SLOPIFY_UPDATE_TOKEN", "a".repeat(64));
    vi.stubEnv("SLOPIFY_UPDATE_PENDING", "1");

    const candidate = await boot(config(dir));
    expect(existsSync(orphan)).toBe(true);
    mkdirSync(join(dir, "updates"), { recursive: true });
    writeFileSync(
      join(dir, "updates", "current.json"),
      JSON.stringify({ version: readVersion(), token: "a".repeat(64) }),
    );
    expect(
      (
        await fetch(`${candidate.url}/api/update/activate`, {
          method: "POST",
          headers: { "X-Slopify-Update-Token": "a".repeat(64) },
        })
      ).status,
    ).toBe(200);
    await vi.waitFor(() => expect(existsSync(orphan)).toBe(false));
    running.push(candidate.stop);
  });

  it("serves the HTTP app at the URL it returns and stops it again", async () => {
    const { url, stop } = await boot(config(dataDir()));

    const health = await fetch(`${url}/api/health`);
    expect(health.status).toBe(200);
    expect(health.headers.get("x-slopify-version")).toBe(readVersion());
    const drafts = await fetch(`${url}/api/drafts`);
    expect(drafts.status).toBe(200);
    expect(await drafts.json()).toEqual({ drafts: [] });
    await stop();

    await expect(fetch(`${url}/api/health`)).rejects.toThrow();
  });

  it("refuses in-app package updates in a container", async () => {
    vi.stubEnv("SLOPIFY_DISABLE_UPDATES", "1");
    const { url, stop } = await boot(config(dataDir()));
    running.push(stop);

    const response = await fetch(`${url}/api/update`, { method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("pulling a new image");
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
    expect(urlOf("127.0.0.1", 6969)).toBe("http://127.0.0.1:6969");
    expect(urlOf("::1", 6969)).toBe("http://[::1]:6969");
  });
});
