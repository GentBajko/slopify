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
      "document_themes",
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
      "document_themes_name",
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
      { version: 13, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 14, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 15, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 16, applied_at: "2026-09-02T10:00:00.000Z" },
    ]);
  });

  it("is a no-op the second time", () => {
    const db = openDb(":memory:");

    migrate(db, clock);
    migrate(db, clock);

    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: 16 });
  });

  it("refuses a database newer than the app knows", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(42, clock.now().toISOString());

    expect(() => migrate(db, clock)).toThrow(
      "database schema 42 is newer than this app knows (16)",
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

  it("adds a switched-off document stage to every project without losing a row", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 13)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      db.exec("INSERT INTO projects VALUES ('p1','Saved','16:9','{}','old','old')");
      db.exec("INSERT INTO projects VALUES ('p2','Other','9:16','{}','old','old')");
      for (const kind of ["research", "article", "audio", "images", "thumbnail", "video"])
        db.prepare(
          "INSERT INTO stages (id,project_id,kind,source,state,attempt_count) VALUES (?,?,?,?,?,2)",
        ).run(`s-${kind}`, "p1", kind, "generate", "done");
      db.exec("INSERT INTO attempts (id,stage_id,n,started_at) VALUES ('a1','s-audio',1,'old')");
      db.exec("INSERT INTO stage_pieces VALUES ('c1','s-audio','chunk',1,'done',NULL)");
      db.exec("INSERT INTO project_revisions VALUES ('r1','p1',NULL,NULL,'{}','{}','{}','old')");
      db.exec(
        "INSERT INTO revision_work (id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('w1','p1','r1','s-audio','audio','f','done','allowed','old')",
      );
      db.exec(
        "INSERT INTO revision_pieces VALUES ('rp1','p1','r1','audio:body:1','audio',NULL,'f','{}',NULL,1,'old')",
      );
      const kept = ["stages", "attempts", "stage_pieces", "revision_work", "revision_pieces"];
      const before = kept.map((table) => db.prepare(`SELECT * FROM ${table}`).all());

      migrate(db, clock);

      expect(
        kept.map((table) =>
          db
            .prepare(`SELECT * FROM ${table}`)
            .all()
            .filter((row) => row.kind !== "document"),
        ),
      ).toEqual(before);
      expect(
        db
          .prepare("SELECT project_id,source,state FROM stages WHERE kind='document' ORDER BY 1")
          .all(),
      ).toEqual([
        { project_id: "p1", source: "off", state: "skipped" },
        { project_id: "p2", source: "off", state: "skipped" },
      ]);
      expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      expect(names(db, "index")).toEqual(
        expect.arrayContaining([
          "stages_project_identity",
          "revision_pieces_selected",
          "revision_pieces_revision",
          "revision_pieces_publication",
        ]),
      );
      db.exec(
        "INSERT INTO revision_pieces VALUES ('rp2','p1','r1','document:pdf','document',NULL,'f','{}',NULL,1,'old')",
      );
      expect(() =>
        db.exec(
          "INSERT INTO stages (id,project_id,kind,source,state) VALUES ('x','p2','poster','off','skipped')",
        ),
      ).toThrow();
      // The rebuilt table still carries the cascade the old one had.
      db.exec("DELETE FROM projects WHERE id='p1'");
      expect(db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
      expect(db.prepare("SELECT count(*) AS n FROM revision_work").get()).toEqual({ n: 0 });
    } finally {
      db.close();
    }
  });

  it("keeps every saved prompt when adding the description kind to a version 14 library", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 14)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      for (const kind of ["article", "image", "thumbnail", "narration"])
        db.prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)").run(
          kind,
          kind,
          "Saved",
          "Body {{Topic}}.",
          '["Topic"]',
          "original-date",
        );
      expect(() =>
        db
          .prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)")
          .run("d0", "description", "D", "B", "[]", "x"),
      ).toThrow();
      const before = db.prepare("SELECT * FROM prompts ORDER BY id").all();
      migrate(db, clock);
      expect(db.prepare("SELECT * FROM prompts ORDER BY id").all()).toEqual(before);
      db.prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)").run(
        "d1",
        "description",
        "Saved",
        "Hook",
        "[]",
        "today",
      );
      expect(() =>
        db
          .prepare("INSERT INTO prompts VALUES (?,?,?,?,?,?)")
          .run("d2", "description", "SAVED", "Other", "[]", "today"),
      ).toThrow();
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
    // Besides the switched-off document stage version 14 adds to every project.
    expect(
      ["projects", "stages", "stage_pieces", "outputs"].map((table) =>
        db
          .prepare(`SELECT * FROM ${table}`)
          .all()
          .filter((row) => row.kind !== "document"),
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
