import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout } from "../../kernel/paths.js";
import { reconcileStorage } from "./reconcile.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function migrated(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  return db;
}

function dataDir(): string {
  return mkdtempSync(join(tmpdir(), "slopify-reconcile-"));
}

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
