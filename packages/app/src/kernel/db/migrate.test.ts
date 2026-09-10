import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../clock.fake.js";
import { openDb } from "./index.js";
import { migrate } from "./migrate.js";

const clock = fixedClock("2026-09-02T10:00:00.000Z");

function names(db: ReturnType<typeof openDb>, type: "table" | "index"): string[] {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = ? AND name NOT LIKE 'sqlite_%'")
    .all(type)
    .map((row) => String(row.name))
    .sort();
}

describe("openDb", () => {
  it("keeps the database and its WAL sidecars owner-only", () => {
    const file = join(mkdtempSync(join(tmpdir(), "slopify-db-")), "slopify.db");

    const db = openDb(file);
    migrate(db, clock);

    expect(db.prepare("PRAGMA journal_mode").get()).toEqual({ journal_mode: "wal" });
    for (const path of [file, `${file}-wal`, `${file}-shm`]) {
      expect(statSync(path).mode & 0o777).toBe(0o600);
    }
    db.close();
  });
});

describe("migrate", () => {
  it("creates every table of the designed schema", () => {
    const db = openDb(":memory:");

    migrate(db, clock);

    expect(names(db, "table")).toEqual([
      "attempts",
      "batches",
      "entries",
      "machine",
      "outputs",
      "project_assets",
      "project_controls",
      "project_heads",
      "project_queue",
      "project_revisions",
      "projects",
      "prompts",
      "provider_keys",
      "revision_mutations",
      "revision_outputs",
      "revision_pieces",
      "schema_migrations",
      "settings",
      "stage_pieces",
      "staged_files",
      "stages",
      "telemetry_events",
      "voices",
    ]);
    expect(names(db, "index")).toEqual([
      "entries_name",
      "outputs_project",
      "project_queue_state",
      "project_revisions_project",
      "prompts_name",
      "revision_outputs_publication",
      "revision_outputs_revision",
      "revision_outputs_selected",
      "revision_pieces_publication",
      "revision_pieces_revision",
      "revision_pieces_selected",
    ]);
  });

  it("records the versions it applied", () => {
    const db = openDb(":memory:");

    migrate(db, clock);

    expect(db.prepare("SELECT version, applied_at FROM schema_migrations").all()).toEqual([
      { version: 1, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 2, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 3, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 4, applied_at: "2026-09-02T10:00:00.000Z" },
    ]);
  });

  it("is a no-op the second time", () => {
    const db = openDb(":memory:");

    migrate(db, clock);
    migrate(db, clock);

    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: 4 });
  });

  it("refuses a database newer than the app knows", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(42, clock.now().toISOString());

    expect(() => migrate(db, clock)).toThrow("database schema 42 is newer than this app knows (4)");
  });

  it("upgrades existing projects without changing their configuration or outputs", () => {
    const db = openDb(":memory:");
    db.exec(readFileSync(new URL("./migrations/0001-init.sql", import.meta.url), "utf8"));
    db.exec("INSERT INTO schema_migrations VALUES (1, '2026-09-01')");
    db.exec(
      "INSERT INTO projects VALUES ('p1', 'Saved', '16:9', '{\"saved\":true}', '2026-09-01', '2026-09-01')",
    );
    migrate(db, clock);
    expect(db.prepare("SELECT config FROM projects WHERE id = 'p1'").get()).toEqual({
      config: '{"saved":true}',
    });
    expect(db.prepare("SELECT * FROM project_controls").all()).toEqual([]);
    db.exec("INSERT INTO project_controls VALUES ('p1', 1)");
    db.exec("DELETE FROM projects WHERE id = 'p1'");
    expect(db.prepare("SELECT * FROM project_controls").all()).toEqual([]);
    db.close();
  });

  it.each([1, 3])("keeps schema %i legacy rows intact and revision storage empty", (version) => {
    const db = openDb(":memory:");
    const files = ["0001-init.sql", "0002-project-controls.sql", "0003-batch-queue.sql"];
    for (const file of files.slice(0, version)) {
      db.exec(readFileSync(new URL(`./migrations/${file}`, import.meta.url), "utf8"));
      db.prepare("INSERT INTO schema_migrations VALUES (?, '2026-09-01')").run(
        Number(file.slice(0, 4)),
      );
    }
    db.exec("INSERT INTO projects VALUES ('p1','Saved','16:9','{}','old','old')");
    db.exec(
      "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('s1','p1','audio','generate','done')",
    );
    db.exec(
      "INSERT INTO stage_pieces VALUES ('c1','s1','chunk',1,'done','{\"file\":\"audio/body.wav\"}')",
    );
    db.exec(
      "INSERT INTO outputs VALUES ('o1','p1','audio','audio_body','audio/body.wav',NULL,12,1000,'{}','old')",
    );
    const before = ["projects", "stages", "stage_pieces", "outputs"].map((table) =>
      db.prepare(`SELECT * FROM ${table}`).all(),
    );
    migrate(db, clock);
    expect(
      ["projects", "stages", "stage_pieces", "outputs"].map((table) =>
        db.prepare(`SELECT * FROM ${table}`).all(),
      ),
    ).toEqual(before);
    for (const table of [
      "project_revisions",
      "project_assets",
      "project_heads",
      "revision_outputs",
      "revision_pieces",
      "revision_mutations",
    ]) {
      expect(db.prepare(`SELECT * FROM ${table}`).all()).toEqual([]);
    }
    expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    db.close();
  });

  it("enforces the cascade from projects to stages", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    db.exec(
      "INSERT INTO projects VALUES ('p1', 't', '16:9', '{}', '2026-09-02', '2026-09-02');" +
        "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s1','p1','audio','generate','pending')",
    );

    db.exec("DELETE FROM projects WHERE id = 'p1'");

    expect(db.prepare("SELECT count(*) AS n FROM stages").get()).toEqual({ n: 0 });
  });
});
