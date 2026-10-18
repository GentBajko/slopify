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
      "ab_results",
      "agent_actions",
      "attempts",
      "backup_imports",
      "batches",
      "cast_images",
      "cast_members",
      "channel_videos",
      "channels",
      "document_themes",
      "entries",
      "episode_memories",
      "external_reviews",
      "file_places",
      "image_blobs",
      "library_versions",
      "local_work_times",
      "machine",
      "narration_aliases",
      "narration_retries",
      "outputs",
      "plan_limit_readings",
      "plan_limit_waiters",
      "plan_limit_waits",
      "play_draft_attachments",
      "play_drafts",
      "play_start_receipts",
      "prepared_videos",
      "project_assets",
      "project_channels",
      "project_control_receipts",
      "project_controls",
      "project_folders",
      "project_heads",
      "project_queue",
      "project_recovery_requests",
      "project_revisions",
      "project_set_aside",
      "project_starts",
      "project_template_instantiations",
      "project_template_revisions",
      "project_templates",
      "project_trash",
      "project_uploads",
      "projects",
      "prompt_softening",
      "prompts",
      "provider_keys",
      "provider_usage",
      "rebuild_admissions",
      "rebuild_previews",
      "releases",
      "review_checkpoint_approvals",
      "review_checkpoints",
      "review_verdicts",
      "revision_mutations",
      "revision_outputs",
      "revision_pieces",
      "revision_provided_reviews",
      "revision_work",
      "revision_work_pieces",
      "revision_work_reservations",
      "schedule_runs",
      "schedule_topics",
      "schedules",
      "schema_migrations",
      "settings",
      "stage_pieces",
      "staged_files",
      "stages",
      "standalone_usage",
      "studio_reports",
      "telemetry_events",
      "told_failures",
      "video_stats",
      "voices",
      "youtube_description_edits",
      "youtube_videos",
    ]);
    expect(names(db, "index")).toEqual([
      "agent_actions_once",
      "agent_actions_project",
      "agent_actions_time",
      "cast_images_member",
      "cast_members_channel",
      "cast_members_order",
      "channel_videos_title",
      "channels_one_default",
      "document_themes_name",
      "entries_name",
      "episode_memories_channel",
      "episode_memories_project",
      "external_reviews_waiting",
      "file_places_place",
      "local_work_times_project",
      "narration_retries_pending",
      "outputs_project",
      "plan_limit_readings_project",
      "play_draft_attachment_file",
      "play_draft_attachment_owner",
      "play_start_receipt_draft",
      "prepared_videos_title",
      "project_folders_folder",
      "project_queue_state",
      "project_revisions_project",
      "prompts_name",
      "provider_usage_project",
      "review_checkpoint_work",
      "review_verdicts_item",
      "review_verdicts_redo",
      "revision_outputs_publication",
      "revision_outputs_revision",
      "revision_outputs_selected",
      "revision_piece_dispatch",
      "revision_pieces_publication",
      "revision_pieces_revision",
      "revision_pieces_selected",
      "revision_work_admission",
      "revision_work_dispatch",
      "revision_work_reservations_work",
      "revision_work_retry",
      "revision_work_revision_identity",
      "revision_work_stage",
      "schedule_runs_schedule",
      "schedule_topics_schedule",
      "schedules_due",
      "stages_project_identity",
      "standalone_usage_created",
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
      { version: 17, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 18, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 19, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 22, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 24, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 25, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 26, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 27, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 30, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 31, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 32, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 34, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 35, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 37, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 38, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 39, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 40, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 41, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 42, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 43, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 44, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 45, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 46, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 47, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 48, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 49, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 50, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 51, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 52, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 53, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 54, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 55, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 56, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 57, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 58, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 59, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 60, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 61, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 62, applied_at: "2026-09-02T10:00:00.000Z" },
      { version: 65, applied_at: "2026-09-02T10:00:00.000Z" },
    ]);
  });

  it("is a no-op the second time", () => {
    const db = openDb(":memory:");

    migrate(db, clock);
    migrate(db, clock);

    expect(db.prepare("SELECT count(*) AS n FROM schema_migrations").get()).toEqual({ n: 56 });
  });

  it("refuses a database newer than the app knows", () => {
    const db = openDb(":memory:");
    migrate(db, clock);
    db.prepare("INSERT INTO schema_migrations VALUES (?, ?)").run(66, clock.now().toISOString());

    expect(() => migrate(db, clock)).toThrow(
      "database schema 66 is newer than this app knows (65)",
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
    db.exec("INSERT INTO project_controls (project_id, paused) VALUES ('p1', 1)");
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
        db.prepare(
          "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
        ).run(
          kind,
          kind,
          "Saved",
          "Detailed {{Delivery Style}}. ".repeat(1000),
          '["Delivery Style"]',
          "original-date",
        );
      const before = db
        .prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id")
        .all();
      migrate(db, clock);
      expect(
        db.prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id").all(),
      ).toEqual(before);
      db.prepare(
        "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
      ).run("n", "narration", "Saved", "Style", "[]", "today");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
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
            .filter((row) => row.kind !== "document")
            .map(withoutRetryColumns),
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
        db.prepare(
          "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
        ).run(kind, kind, "Saved", "Body {{Topic}}.", '["Topic"]', "original-date");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("d0", "description", "D", "B", "[]", "x"),
      ).toThrow();
      const before = db
        .prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id")
        .all();
      migrate(db, clock);
      expect(
        db.prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id").all(),
      ).toEqual(before);
      db.prepare(
        "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
      ).run("d1", "description", "Saved", "Hook", "[]", "today");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("d2", "description", "SAVED", "Other", "[]", "today"),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("keeps every saved prompt when adding the shorts kind to a version 18 library", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 18)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      for (const kind of ["article", "image", "thumbnail", "narration", "description"])
        db.prepare(
          "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
        ).run(kind, kind, "Saved", "Body {{Topic}}.", '["Topic"]', "original-date");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("s0", "shorts", "S", "B", "[]", "x"),
      ).toThrow();
      const before = db
        .prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id")
        .all();
      migrate(db, clock);
      expect(
        db.prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id").all(),
      ).toEqual(before);
      db.prepare(
        "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
      ).run("s1", "shorts", "Saved", "Hooks", "[]", "today");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("s2", "shorts", "SAVED", "Other", "[]", "today"),
      ).toThrow();
    } finally {
      db.close();
    }
  });

  it("keeps every saved prompt when adding the review kind to a version 24 library", () => {
    const db = openDb(":memory:");
    try {
      const directory = new URL("./migrations/", import.meta.url);
      for (const file of readdirSync(directory)
        .filter((name) => name.endsWith(".sql") && Number(name.slice(0, 4)) <= 24)
        .sort()) {
        db.exec(readFileSync(new URL(file, directory), "utf8"));
        db.prepare("INSERT INTO schema_migrations VALUES (?,?)").run(
          Number(file.slice(0, 4)),
          clock.now().toISOString(),
        );
      }
      for (const kind of ["article", "image", "thumbnail", "narration", "description", "shorts"])
        db.prepare(
          "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
        ).run(kind, kind, "Saved", "Body {{Topic}}.", '["Topic"]', "original-date");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("r0", "review", "R", "B", "[]", "x"),
      ).toThrow();
      const before = db
        .prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id")
        .all();
      migrate(db, clock);
      expect(
        db.prepare("SELECT id,kind,name,body,slots,updated_at FROM prompts ORDER BY id").all(),
      ).toEqual(before);
      db.prepare(
        "INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)",
      ).run("r1", "review", "Saved", "Strict", "[]", "today");
      expect(() =>
        db
          .prepare("INSERT INTO prompts (id,kind,name,body,slots,updated_at) VALUES (?,?,?,?,?,?)")
          .run("r2", "review", "SAVED", "Other", "[]", "today"),
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
          .filter((row) => row.kind !== "document")
          .map(withoutRetryColumns),
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

// Version 30 adds the automatic retry's columns to every stage and step row, empty.
function withoutRetryColumns(row: Record<string, unknown>): Record<string, unknown> {
  const { failure_kind: kind, retry_at: at, auto_retries: count, ...rest } = row;
  if ((kind !== undefined && kind !== null) || (at !== undefined && at !== null))
    throw new Error("an existing row gained a retry");
  if (count !== undefined && count !== 0) throw new Error("an existing row gained a retry");
  return rest;
}

it("keeps every project and its links when it widens the format to square", () => {
  const db = openDb(":memory:");
  migrate(db, clock, { through: 48 });
  db.prepare("INSERT INTO projects VALUES ('p1','One','16:9','{}','old','old')").run();
  db.prepare("INSERT INTO project_controls (project_id, paused) VALUES ('p1', 1)").run();
  migrate(db, clock);
  db.prepare("INSERT INTO projects VALUES ('p2','Two','1:1','{}','new','new')").run();
  expect(db.prepare("SELECT id, format FROM projects ORDER BY id").all()).toEqual([
    { id: "p1", format: "16:9" },
    { id: "p2", format: "1:1" },
  ]);
  expect(db.prepare("SELECT paused FROM project_controls WHERE project_id='p1'").get()).toEqual({
    paused: 1,
  });
  expect(() =>
    db.prepare("INSERT INTO projects VALUES ('p3','Three','4:3','{}','new','new')").run(),
  ).toThrow();
});

it("keeps each channel's cast in the alphabetical order it was shown in, per channel", () => {
  const db = openDb(":memory:");
  migrate(db, clock, { through: 51 });
  db.exec("INSERT INTO channels (id, name, created_at, updated_at) VALUES ('c2','Other','a','a')");
  const add = db.prepare(
    "INSERT INTO cast_members (id, channel_id, kind, name, created_at, updated_at) VALUES (?,?,'character',?,'a','a')",
  );
  const main = "00000000-0000-4000-8000-000000000001";
  add.run("m3", main, "zeno");
  add.run("m1", main, "Ada");
  add.run("m2", main, "ada");
  add.run("m4", "c2", "Bram");
  migrate(db, clock);
  expect(
    db.prepare("SELECT id, position FROM cast_members ORDER BY channel_id, position").all(),
  ).toEqual([
    { id: "m1", position: 0 },
    { id: "m2", position: 1 },
    { id: "m3", position: 2 },
    { id: "m4", position: 0 },
  ]);
});

it("keeps every external review and lets Cancel close one as canceled", () => {
  const db = openDb(":memory:");
  migrate(db, clock, { through: 58 });
  db.exec("INSERT INTO projects VALUES ('p1','One','16:9','{}','a','a')");
  const add = db.prepare(
    `INSERT INTO external_reviews (id,project_id,revision_id,work_id,piece_id,work_key,item_key,stage,item_fingerprint,review_fingerprint,material,state,waiting_since,deadline_at,verdict,answered_by,answered_at)
     VALUES (?,'p1','r1','w1','pc1','image:one','image:one','images','f',?,'{}',?,'a','b',?,?,?)`,
  );
  add.run("er1", "rf1", "waiting", null, null, null);
  add.run("er2", "rf2", "answered", '{"passed":true,"reasons":[]}', "agent", "c");
  expect(() => add.run("er3", "rf3", "canceled", null, null, null)).toThrow();
  migrate(db, clock);
  expect(
    db.prepare("SELECT id, state, answered_by FROM external_reviews ORDER BY id").all(),
  ).toEqual([
    { id: "er1", state: "waiting", answered_by: null },
    { id: "er2", state: "answered", answered_by: "agent" },
  ]);
  add.run("er3", "rf3", "canceled", null, null, null);
  expect(db.prepare("SELECT state FROM external_reviews WHERE id='er3'").get()).toEqual({
    state: "canceled",
  });
});

it("keeps every review verdict and external review and lets the promise check and the assistant use them", () => {
  const db = openDb(":memory:");
  migrate(db, clock, { through: 62 });
  db.exec("INSERT INTO projects VALUES ('p1','One','16:9','{}','a','a')");
  const verdict = db.prepare(
    `INSERT INTO review_verdicts (id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,action,action_at,action_by,redo_state,redo_error,answered_by,created_at)
     VALUES (?,'p1','r1',?,?,'f',?,?,'[]',?,1,?,?,?,NULL,NULL,'model','a')`,
  );
  verdict.run("v1", "article", "article", "rf1", 1, "passed", null, null, null);
  verdict.run("v2", "image:one", "images", "rf2", 0, "flagged", "overruled", "b", "agent");
  expect(() =>
    verdict.run("v3", "promise", "promise", "rf3", 1, "passed", null, null, null),
  ).toThrow();
  const external = db.prepare(
    `INSERT INTO external_reviews (id,project_id,revision_id,work_id,piece_id,work_key,item_key,stage,item_fingerprint,review_fingerprint,material,state,waiting_since,deadline_at,verdict,answered_by,answered_at)
     VALUES (?,'p1','r1','w1','pc1',?,?,?,'f',?,'{}',?,'a','b',?,?,?)`,
  );
  external.run("er1", "image:one", "image:one", "images", "rf1", "waiting", null, null, null);
  external.run("er2", "article", "article", "article", "rf2", "canceled", null, null, null);
  external.run(
    "er3",
    "article",
    "article",
    "article",
    "rf3",
    "answered",
    '{"passed":true,"reasons":[]}',
    "agent",
    "c",
  );
  const verdictsBefore = db.prepare("SELECT * FROM review_verdicts ORDER BY id").all();
  const externalBefore = db.prepare("SELECT * FROM external_reviews ORDER BY id").all();

  migrate(db, clock);

  expect(db.prepare("SELECT * FROM review_verdicts ORDER BY id").all()).toEqual(verdictsBefore);
  expect(db.prepare("SELECT * FROM external_reviews ORDER BY id").all()).toEqual(externalBefore);
  verdict.run("v3", "promise", "promise", "rf3", 0, "flagged", "redone", "c", "assistant");
  external.run("er4", "promise", "promise", "promise", "rf4", "answered", "{}", "assistant", "d");
  expect(() =>
    verdict.run("v4", "promise", "poster", "rf4", 1, "passed", null, null, null),
  ).toThrow();
  expect(() =>
    external.run("er5", "x", "x", "promise", "rf5", "answered", "{}", "robot", "d"),
  ).toThrow();
  expect(db.prepare("PRAGMA foreign_keys").get()).toEqual({ foreign_keys: 1 });
  expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  expect(names(db, "index")).toEqual(
    expect.arrayContaining([
      "review_verdicts_item",
      "review_verdicts_redo",
      "external_reviews_waiting",
    ]),
  );
  db.exec("DELETE FROM projects WHERE id='p1'");
  expect(db.prepare("SELECT count(*) AS n FROM review_verdicts").get()).toEqual({ n: 0 });
  expect(db.prepare("SELECT count(*) AS n FROM external_reviews").get()).toEqual({ n: 0 });
});
