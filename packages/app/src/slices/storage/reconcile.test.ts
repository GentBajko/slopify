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

  // A process that died mid-stage leaves the chunks it finished, and the manual retry re-runs
  // only the ones it did not. A chunk is not an output, so its file is named by the piece
  // payload and this is what stops the boot sweeping it up.
  it("keeps a file a stage piece names and drops one whose piece never wrote it", () => {
    const paths = layout(dataDir());
    ensureDirs(paths, { mode: 0o700 });
    const db = migrated();
    db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
    db.exec(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','audio','generate','failed')",
    );
    const piece = db.prepare(
      "INSERT INTO stage_pieces (id, stage_id, kind, idx, state, payload) VALUES (?, 's1', 'chunk', ?, ?, ?)",
    );
    piece.run("c1", 1, "done", JSON.stringify({ text: "one", file: "audio-chunks/001.mp3" }));
    // A chunk that never got an answer names no file, so the bytes beside it belong to
    // nobody: a half-written file from the attempt that was interrupted.
    piece.run("c2", 2, "pending", JSON.stringify({ text: "two" }));
    mkdirSync(join(paths.projects, "p1", "audio-chunks"), { recursive: true });
    writeFileSync(join(paths.projects, "p1", "audio-chunks", "001.mp3"), "kept");
    writeFileSync(join(paths.projects, "p1", "audio-chunks", "002.mp3"), "orphan");
    // The concat script of a join that never finished is nobody's either.
    writeFileSync(join(paths.projects, "p1", "audio-chunks", "concat.txt"), "orphan");

    expect(reconcileStorage(db, paths)).toEqual({ orphanFiles: 2, stagedFiles: 0 });

    expect(readFileSync(join(paths.projects, "p1", "audio-chunks", "001.mp3"), "utf8")).toBe(
      "kept",
    );
    expect(existsSync(join(paths.projects, "p1", "audio-chunks", "002.mp3"))).toBe(false);
    expect(existsSync(join(paths.projects, "p1", "audio-chunks", "concat.txt"))).toBe(false);
  });

  // Every other kind of piece carries a payload of its own shape; none of them names a
  // file, and a payload this module cannot read must not stop the sweep.
  it("ignores a payload that names no file and one that is not JSON at all", () => {
    const paths = layout(dataDir());
    ensureDirs(paths, { mode: 0o700 });
    const db = migrated();
    db.exec("INSERT INTO projects VALUES ('p1','t','16:9','{}','2026-09-01','2026-09-01')");
    db.exec(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','research','generate','failed')",
    );
    const piece = db.prepare(
      "INSERT INTO stage_pieces (id, stage_id, kind, idx, state, payload) VALUES (?, 's1', ?, ?, 'done', ?)",
    );
    piece.run("c1", "chapter", 1, JSON.stringify({ title: "History", notes: "..." }));
    piece.run("c2", "chapter", 2, "not json at all");
    piece.run("c3", "chapter", 3, JSON.stringify({ file: 42 }));
    mkdirSync(join(paths.projects, "p1"), { recursive: true });
    writeFileSync(join(paths.projects, "p1", "stray.bin"), "orphan");

    expect(reconcileStorage(db, paths)).toEqual({ orphanFiles: 1, stagedFiles: 0 });

    expect(existsSync(join(paths.projects, "p1", "stray.bin"))).toBe(false);
  });
});
