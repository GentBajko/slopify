import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
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
      "play_draft_attachments",
      "play_drafts",
      "play_start_receipts",
      "project_assets",
      "project_control_receipts",
      "project_controls",
      "project_heads",
      "project_queue",
      "project_recovery_requests",
      "project_revisions",
      "project_template_instantiations",
      "project_template_revisions",
      "project_templates",
      "projects",
      "prompts",
      "provider_keys",
      "rebuild_admissions",
      "rebuild_previews",
      "review_checkpoint_approvals",
      "review_checkpoints",
      "revision_mutations",
      "revision_outputs",
      "revision_pieces",
      "revision_provided_reviews",
      "revision_work",
      "revision_work_pieces",
      "revision_work_reservations",
      "schedule_runs",
      "schedules",
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
      "play_draft_attachment_file",
      "play_draft_attachment_owner",
      "play_start_receipt_draft",
      "project_queue_state",
      "project_revisions_project",
      "prompts_name",
      "review_checkpoint_work",
      "revision_outputs_publication",
      "revision_outputs_revision",
      "revision_outputs_selected",
      "revision_piece_dispatch",
      "revision_pieces_publication",
      "revision_pieces_revision",
      "revision_pieces_selected",
      "revision_work_dispatch",
      "revision_work_revision_identity",
      "revision_work_stage",
      "schedule_runs_schedule",
      "schedules_due",
      "stages_project_identity",
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
      { version: 5, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 6, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 7, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 8, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 9, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 10, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 11, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 12, applied_at: "2026-09-02T10:00:00.000Z" },
    ]);
  });

  it("is a no-op the second time", () => {
    const db = openDb(":memory:");

    migrate(db, clock);
    migrate(db, clock);

    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: 12 });
  });

  it("refuses a database newer than the app knows", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(42, clock.now().toISOString());

    expect(() => migrate(db, clock)).toThrow(
      "database schema 42 is newer than this app knows (12)",
    );
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

  it("preserves every prompt field when adding narration to a version 10 library", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 10)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      for (const kind of ["article", "image", "thumbnail"])
        db.prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)").run(
          kind,
          kind,
          "Saved",
          "Detailed {{Delivery Style}}. ".repeat(1000),
          '["Delivery Style"]',
          "original-date",
        );
      const before = db.prepare("SELECT * FROM prompts ORDER BY id").all();
      migrate(db, clock);
      expect(db.prepare("SELECT * FROM prompts ORDER BY id").all()).toEqual(before);
      db.prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)").run(
        "n",
        "narration",
        "Saved",
        "Style",
        "[]",
        "today",
      );
      expect(() =>
        db
          .prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)")
          .run("n2", "narration", "SAVED", "Other", "[]", "today"),
      ).toThrow();
      migrate(db, clock);
      expect(db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 4 });
    } finally {
      db.close();
    }
  });

  it("upgrades version 9 schedules to FK-free tombstones with retained occurrences", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 9)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      db.exec(
        "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES('t1',1,'hash','old')",
      );
      db.exec(`INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,
        missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at)
        VALUES('s1','Saved','t1',1,'{}','UTC','skip','skip','[]','completed',2,'hash','old','old')`);
      db.exec(`INSERT INTO schedule_runs(id,schedule_id,scheduled_for,status,request_id,project_ids_json,estimate_json,started_at,ended_at,error)
        VALUES('r1','s1','old','succeeded','request1','["project1"]','[]','start','end',NULL)`);
      const scheduleColumns = `id,name,template_id,template_version,cadence_json,timezone,
        missed_policy,overlap_policy,spend_limit_cents,items_json,status,version,creation_hash,
        next_run_at,created_at,updated_at,mutation_id,mutation_hash`;
      const beforeSchedule = db.prepare(`SELECT ${scheduleColumns} FROM schedules`).all();
      const runColumns = `id,schedule_id,scheduled_for,status,request_id,project_ids_json,
        estimate_json,started_at,ended_at,error`;
      const before = db.prepare(`SELECT ${runColumns} FROM schedule_runs`).all();
      migrate(db, clock);
      expect(db.prepare(`SELECT ${scheduleColumns} FROM schedules`).all()).toEqual(beforeSchedule);
      expect(db.prepare("SELECT deleted_at FROM schedules WHERE id='s1'").get()).toEqual({
        deleted_at: null,
      });
      db.exec("UPDATE schedules SET deleted_at='deleted',next_run_at=NULL WHERE id='s1'");
      db.exec("DELETE FROM project_templates WHERE id='t1'");
      expect(db.prepare("SELECT id,template_id,deleted_at FROM schedules").all()).toEqual([
        { id: "s1", template_id: "t1", deleted_at: "deleted" },
      ]);
      expect(db.prepare(`SELECT ${runColumns} FROM schedule_runs`).all()).toEqual(before);
      expect(db.prepare("SELECT projects_settled_at FROM schedule_runs").all()).toEqual([
        { projects_settled_at: null },
      ]);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
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
      "project_control_receipts",
      "project_heads",
      "revision_outputs",
      "revision_pieces",
      "revision_provided_reviews",
      "revision_mutations",
      "review_checkpoints",
      "review_checkpoint_approvals",
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
