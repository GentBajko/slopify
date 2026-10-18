import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../clock.fake.js";
import { openDb } from "./index.js";
import { migrate } from "./migrate.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
const sha = "a".repeat(64);

function fresh(): DatabaseSync {
  const db = openDb(":memory:");
  migrate(db, clock);
  return db;
}

function design(db: DatabaseSync, id: string, projectId: string | null = null): void {
  db.prepare(
    "INSERT INTO designs (id,kind,name,channel_id,project_id,created_at,updated_at) VALUES (?,'edit','Poster','c1',?,'a','a')",
  ).run(id, projectId);
}

function step(db: DatabaseSync, id: string, designId: string, n: number, parent?: string): void {
  db.prepare(
    "INSERT INTO design_steps (id,design_id,n,parent_id,kind,state,sha256,created_at) VALUES (?,?,?,?,'upload','ready',?,'a')",
  ).run(id, designId, n, parent ?? null, sha);
}

describe("design migrations", () => {
  it("keeps every metered call and lets a design own one", () => {
    const db = openDb(":memory:");
    migrate(db, clock, { through: 69 });
    const add = db.prepare(
      `INSERT INTO standalone_usage (id,owner_kind,owner_id,channel_id,purpose,kind,provider,model,tokens_in,images,size,wall_ms,on_plan,cost,price_json,account,reading_json,created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    add.run(
      "u1",
      "schedule",
      "s1",
      "c1",
      "topics",
      "llm",
      "openai",
      "gpt",
      12,
      null,
      null,
      40,
      0,
      0.5,
      '{"in":1}',
      null,
      null,
      "t1",
    );
    add.run(
      "u2",
      "channel",
      "c1",
      "c1",
      "cast-image",
      "image",
      "codex-image",
      "codex-imagegen",
      null,
      1,
      "1:1",
      900,
      1,
      null,
      null,
      "codex",
      '{"after":[]}',
      "t2",
    );
    expect(() =>
      add.run(
        "u3",
        "design",
        "d1",
        "c1",
        "picture-edit",
        "image",
        "fal",
        "m",
        null,
        1,
        null,
        1,
        0,
        0.04,
        null,
        null,
        null,
        "t3",
      ),
    ).toThrow();
    const before = db.prepare("SELECT * FROM standalone_usage ORDER BY id").all();

    migrate(db, clock);

    expect(db.prepare("SELECT * FROM standalone_usage ORDER BY id").all()).toEqual(before);
    add.run(
      "u3",
      "design",
      "d1",
      "c1",
      "picture-edit",
      "image",
      "fal",
      "m",
      null,
      1,
      null,
      1,
      0,
      0.04,
      null,
      null,
      null,
      "t3",
    );
    expect(() =>
      add.run(
        "u4",
        "project",
        "p1",
        "c1",
        "x",
        "image",
        "fal",
        "m",
        null,
        1,
        null,
        1,
        0,
        0,
        null,
        null,
        null,
        "t4",
      ),
    ).toThrow();
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='standalone_usage' AND name NOT LIKE 'sqlite_%'",
        )
        .all(),
    ).toEqual([{ name: "standalone_usage_created" }]);
  });

  it("reads every older schedule as a project schedule and every older run as making no design", () => {
    const db = openDb(":memory:");
    migrate(db, clock, { through: 69 });
    db.prepare(
      `INSERT INTO schedules (id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,created_at,updated_at)
       VALUES ('s1','Weekly','t1',1,'{"kind":"daily"}','UTC','skip','skip','[]','active',1,'h','a','a')`,
    ).run();
    db.prepare(
      "INSERT INTO schedule_runs (id,schedule_id,scheduled_for,status,project_ids_json,started_at) VALUES ('r1','s1','x','succeeded','[\"p1\"]','a')",
    ).run();

    migrate(db, clock);

    expect(db.prepare("SELECT template_kind FROM schedules").get()).toEqual({
      template_kind: "project",
    });
    expect(db.prepare("SELECT project_ids_json, design_ids_json FROM schedule_runs").get()).toEqual(
      {
        project_ids_json: '["p1"]',
        design_ids_json: "[]",
      },
    );
    expect(() => db.prepare("UPDATE schedules SET template_kind='poster'").run()).toThrow();
    db.prepare("UPDATE schedules SET template_kind='design'").run();
  });

  it("deletes a design's steps with it and unlinks a design from a deleted project", () => {
    const db = fresh();
    db.prepare(
      "INSERT INTO image_blobs (sha256,mime,bytes,created_at) VALUES (?,'image/png',X'00','a')",
    ).run(sha);
    db.prepare("INSERT INTO projects VALUES ('p1','One','16:9','{}','a','a')").run();
    design(db, "d1", "p1");
    design(db, "d2");
    step(db, "s1", "d1", 1);
    step(db, "s2", "d1", 2, "s1");
    step(db, "s3", "d2", 1);

    db.prepare("DELETE FROM projects WHERE id='p1'").run();
    expect(db.prepare("SELECT project_id FROM designs WHERE id='d1'").get()).toEqual({
      project_id: null,
    });

    db.prepare("DELETE FROM designs WHERE id='d1'").run();
    expect(db.prepare("SELECT id FROM design_steps ORDER BY id").all()).toEqual([{ id: "s3" }]);
    expect(db.prepare("SELECT count(*) AS n FROM image_blobs").get()).toEqual({ n: 1 });
  });

  it("refuses a step that is ready without a picture, a repeated number or an unknown kind", () => {
    const db = fresh();
    design(db, "d1");
    const add = db.prepare(
      "INSERT INTO design_steps (id,design_id,n,kind,state,sha256,created_at) VALUES (?,'d1',?,?,?,NULL,'a')",
    );
    expect(() => add.run("s1", 1, "edit", "ready")).toThrow();
    add.run("s1", 1, "edit", "making");
    expect(() => add.run("s2", 1, "edit", "making")).toThrow();
    expect(() => add.run("s3", 2, "mask", "making")).toThrow();
    expect(() =>
      db
        .prepare(
          "INSERT INTO designs (id,kind,name,channel_id,created_at,updated_at) VALUES ('d9','video','x','c1','a','a')",
        )
        .run(),
    ).toThrow();
  });

  it("keeps a template's revisions and sample with the template", () => {
    const db = fresh();
    db.prepare(
      "INSERT INTO design_templates (id,head_version,created_at) VALUES ('t1',2,'a')",
    ).run();
    const revision = db.prepare(
      "INSERT INTO design_template_revisions (template_id,version,name,document_json,created_at) VALUES ('t1',?,'Gig poster','{}','a')",
    );
    revision.run(1);
    revision.run(2);
    db.prepare(
      "INSERT INTO design_template_samples (template_id,design_id,version,state,updated_at) VALUES ('t1','d1',2,'queued','a')",
    ).run();
    expect(db.prepare("SELECT gate FROM design_template_revisions WHERE version=1").get()).toEqual({
      gate: "unchecked",
    });
    expect(() => db.prepare("UPDATE design_template_revisions SET gate='maybe'").run()).toThrow();
    db.prepare("DELETE FROM design_templates WHERE id='t1'").run();
    expect(db.prepare("SELECT count(*) AS n FROM design_template_revisions").get()).toEqual({
      n: 0,
    });
    expect(db.prepare("SELECT count(*) AS n FROM design_template_samples").get()).toEqual({ n: 0 });
  });
});
