import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import type { Clock } from "./kernel/clock.js";
import type { Config } from "./kernel/config/index.js";
import { openDb } from "./kernel/db/index.js";
import { migrate } from "./kernel/db/migrate.js";
import { ensureDirs, layout } from "./kernel/paths.js";
import { boot, markInterruptedStages, reconcileStorage } from "./main.js";

const clock: Clock = { now: () => new Date("2026-09-02T10:00:00.000Z") };

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

describe("reconcileStorage", () => {
  it("keeps tracked files, drops orphans, folders of gone projects, and staging", () => {
    const paths = layout(dataDir());
    ensureDirs(paths, { mode: 0o700 });
    const db = migrated();
    db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
    db.exec(
      "INSERT INTO outputs VALUES ('o1','p1','article','article_md','article.md',NULL,3,NULL,NULL,'2026-09-01')",
    );
    db.exec(
      "INSERT INTO outputs VALUES ('o2','p1','images','image','images/1.png',NULL,3,NULL,NULL,'2026-09-01')",
    );
    db.exec(
      "INSERT INTO staged_files VALUES ('s1','audio','abandoned.mp3','take.mp3',3,'staged','2026-09-01')",
    );
    mkdirSync(join(paths.projects, "p1", "images"), { recursive: true });
    writeFileSync(join(paths.projects, "p1", "article.md"), "md");
    writeFileSync(join(paths.projects, "p1", "images", "1.png"), "png");
    writeFileSync(join(paths.projects, "p1", "images", "2.png"), "orphan");
    writeFileSync(join(paths.projects, "p1", "stray.txt"), "orphan");
    mkdirSync(join(paths.projects, "p-deleted"), { recursive: true });
    writeFileSync(join(paths.projects, "p-deleted", "video.mp4"), "orphan");
    writeFileSync(join(paths.projects, "loose.tmp"), "orphan");
    writeFileSync(join(paths.staging, "abandoned.mp3"), "orphan");

    expect(reconcileStorage(db, paths)).toEqual({ orphanFiles: 4, stagedFiles: 1 });

    expect(readFileSync(join(paths.projects, "p1", "article.md"), "utf8")).toBe("md");
    expect(existsSync(join(paths.projects, "p1", "images", "1.png"))).toBe(true);
    expect(existsSync(join(paths.projects, "p1", "images", "2.png"))).toBe(false);
    expect(existsSync(join(paths.projects, "p1", "stray.txt"))).toBe(false);
    expect(existsSync(join(paths.projects, "p-deleted"))).toBe(false);
    expect(existsSync(join(paths.projects, "loose.tmp"))).toBe(false);
    expect(existsSync(join(paths.staging, "abandoned.mp3"))).toBe(false);
    expect(db.prepare("SELECT count(*) AS n FROM staged_files").get()).toEqual({ n: 0 });
  });
});

describe("boot", () => {
  const running: Array<() => Promise<void>> = [];

  afterEach(async () => {
    for (const stop of running.splice(0)) {
      await stop();
    }
  });

  function config(dir: string): Config {
    return { port: 4242, host: "127.0.0.1", dataDir: dir, open: false };
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
