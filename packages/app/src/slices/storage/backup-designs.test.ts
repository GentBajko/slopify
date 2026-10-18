import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { insertProject } from "../admission/repo.js";
import { pngOf } from "../designs/designs.fake.js";
import { poster } from "../designs/document.fake.js";
import { type BackupDeps, planBackup, streamBackup } from "./backup-export.js";
import { importBackup } from "./backup-import.js";

const clock = fixedClock("2026-10-18T10:00:00.000Z");
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function install(): BackupDeps & { readonly db: DatabaseSync; readonly paths: Paths } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-backup-designs-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, clock);
  let next = 0;
  cleanups.push(() => {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  });
  return {
    db,
    paths,
    clock,
    ids: {
      next: () => `id${String(++next).padStart(4, "0")}${Math.random().toString(36).slice(2, 8)}`,
    },
    appVersion: "4.0.0",
  };
}

async function* once(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < bytes.byteLength; at += 777) yield bytes.subarray(at, at + 777);
}

async function exported(deps: BackupDeps): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of streamBackup(planBackup(deps))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

const first = pngOf(1080, 1920, 1);
const second = pngOf(800, 800, 2);
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function seed(db: DatabaseSync): void {
  const at = "2026-10-17T10:00:00.000Z";
  insertProject(db, {
    id: "p1",
    title: "Episode one",
    format: "16:9",
    config: {
      title: "Episode one",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      imagePrompts: [],
      values: {},
      provided: { article: "Saved." },
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
      rendered: {},
    },
    createdAt: at,
    updatedAt: at,
  });
  const run = (sql: string, ...params: (string | number | null | Uint8Array)[]) =>
    db.prepare(sql).run(...params);
  for (const bytes of [first, second])
    run(
      "INSERT INTO image_blobs(sha256,mime,bytes,created_at) VALUES (?,'image/png',?,?)",
      sha(bytes),
      bytes,
      at,
    );
  const design =
    "INSERT INTO designs (id,kind,name,channel_id,project_id,document_json,values_json,head_step_id,sample_of,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
  run(
    design,
    "d1",
    "design",
    "Gig",
    "00000000-0000-4000-8000-000000000001",
    "p1",
    JSON.stringify(poster()),
    '{"Event":"Late Set"}',
    "s2",
    null,
    at,
    at,
  );
  run(
    design,
    "d2",
    "design",
    "Sample",
    "00000000-0000-4000-8000-000000000001",
    null,
    JSON.stringify(poster()),
    "{}",
    null,
    "t1",
    at,
    at,
  );
  const step =
    "INSERT INTO design_steps (id,design_id,n,parent_id,kind,instruction,provider,model,state,sha256,width,height,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)";
  run(step, "s1", "d1", 1, null, "upload", null, null, null, "ready", sha(first), 1080, 1920, at);
  run(
    step,
    "s2",
    "d1",
    2,
    "s1",
    "edit",
    "Darker sky",
    "fal",
    "fal-ai/flux-2",
    "ready",
    sha(second),
    800,
    800,
    at,
  );
  run(
    step,
    "s3",
    "d1",
    3,
    "s2",
    "edit",
    "Evening",
    "fal",
    "fal-ai/flux-2",
    "making",
    null,
    null,
    null,
    at,
  );
  run("INSERT INTO design_templates (id,head_version,created_at) VALUES ('t1',2,?)", at);
  for (const version of [1, 2])
    run(
      "INSERT INTO design_template_revisions (template_id,version,name,document_json,gate,created_at) VALUES ('t1',?,'Gig poster',?,?,?)",
      version,
      JSON.stringify(poster()),
      version === 1 ? "ready" : "unchecked",
      at,
    );
  run(
    "INSERT INTO design_template_samples (template_id,design_id,version,state,updated_at) VALUES ('t1','d2',2,'making',?)",
    at,
  );
}

const rows = (db: DatabaseSync, sql: string) => db.prepare(sql).all();

it("round-trips designs with every version of their picture, and design templates with their sample", async () => {
  const source = install();
  seed(source.db);
  const archive = await exported(source);
  expect(Buffer.from(archive).toString("latin1")).toContain(`files/images/${sha(second)}`);

  const target = install();
  const summary = await importBackup(target, once(archive));
  expect(summary.designs).toEqual({ added: 1, renamed: 0, skipped: 0 });
  expect(summary.designTemplates).toEqual({ added: 1, renamed: 0, skipped: 0 });
  const same = (sql: string) => expect(rows(target.db, sql)).toEqual(rows(source.db, sql));
  same("SELECT * FROM designs ORDER BY id");
  same("SELECT * FROM design_steps WHERE id <> 's3' ORDER BY id");
  same("SELECT sha256,mime,hex(bytes) AS bytes FROM image_blobs ORDER BY sha256");
  same("SELECT * FROM design_templates ORDER BY id");
  same("SELECT * FROM design_template_revisions ORDER BY template_id, version");
  expect(rows(target.db, "SELECT state, error FROM design_steps WHERE id='s3'")).toEqual([
    { state: "failed", error: "Stopped by the backup. Press Try again." },
  ]);
  expect(rows(target.db, "SELECT state FROM design_template_samples")).toEqual([
    { state: "queued" },
  ]);

  // Imported twice: nothing is added again, and nothing here is changed.
  target.db.exec("UPDATE designs SET name='Renamed here' WHERE id='d1'");
  const again = await importBackup(target, once(archive));
  expect(again.designs).toEqual({ added: 0, renamed: 0, skipped: 1 });
  expect(again.designTemplates).toEqual({ added: 0, renamed: 0, skipped: 1 });
  expect(rows(target.db, "SELECT count(*) AS n FROM designs")).toEqual([{ n: 2 }]);
  expect(rows(target.db, "SELECT count(*) AS n FROM design_steps")).toEqual([{ n: 3 }]);
  expect(rows(target.db, "SELECT name FROM designs WHERE id='d1'")).toEqual([
    { name: "Renamed here" },
  ]);
});

it("keeps a design whose project did not come in, unlinked from the different project here", async () => {
  const source = install();
  seed(source.db);
  const archive = await exported(source);
  const target = install();
  insertProject(target.db, {
    id: "p1",
    title: "Another project here",
    format: "16:9",
    config: {
      title: "x",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "off",
        images: "off",
        thumbnail: "off",
        video: "off",
      },
      imagePrompts: [],
      values: {},
      provided: { article: "x" },
      silenceGapSeconds: 0,
      imageSeconds: 15,
      zoomPercent: 22.5,
      motionStyle: "zoom",
      edgeSilenceSeconds: 0,
      rendered: {},
    },
    createdAt: "a",
    updatedAt: "a",
  });
  const summary = await importBackup(target, once(archive));
  expect(summary.projects.skipped.map((project) => project.id)).toEqual(["p1"]);
  expect(rows(target.db, "SELECT project_id FROM designs WHERE id='d1'")).toEqual([
    { project_id: null },
  ]);
});

it("brings in a design schedule with its design template, paused", async () => {
  const source = install();
  seed(source.db);
  source.db
    .prepare(
      `INSERT INTO schedules (id,name,template_kind,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,spend_limit_cents,items_json,topic_keyword,values_json,status,version,creation_hash,next_run_at,created_at,updated_at,deleted_at)
       VALUES ('00000000-0000-4000-8000-0000000000cc','Gig posters','design','t1',1,'{"kind":"by-date","time":"09:00"}','UTC','skip','skip',NULL,'[]',NULL,'{}','active',1,'h',NULL,?,?,NULL)`,
    )
    .run("2026-10-18T10:00:00.000Z", "2026-10-18T10:00:00.000Z");
  const archive = await exported(source);
  const target = install();
  const summary = await importBackup(target, once(archive));
  expect(summary.schedules).toMatchObject({ added: 1, skipped: 0, paused: 1 });
  expect(rows(target.db, "SELECT template_kind, template_id, status FROM schedules")).toEqual([
    { template_kind: "design", template_id: "t1", status: "paused" },
  ]);
});
