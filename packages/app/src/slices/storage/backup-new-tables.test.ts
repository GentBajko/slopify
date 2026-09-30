import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { insertProject } from "../admission/repo.js";
import { defaultChannelId } from "../channels/model.js";
import { writeSetting } from "../settings/repo.js";
import { readChannelLinksFor } from "../youtube/edits-repo.js";
import { type BackupDeps, planBackup, streamBackup } from "./backup-export.js";
import { libraryTables, projectTables, usageTables } from "./backup-format.js";
import { importBackup } from "./backup-import.js";

// Backups carry everything added since 2.5.0 (migrations 0022-0039): prompt history, channels
// with their cast and pictures, episode memories, existing videos, reviews, run cost, project
// channels and the trash.

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

// Every table is either carried or left out on purpose. A new table fails here until it is
// put in one list or the other.
const leftOut = new Set([
  // Secrets and this install's identity.
  "provider_keys",
  "machine",
  // Bookkeeping of this install.
  "schema_migrations",
  "backup_imports",
  // Transient or lease state: a backup waits for every project to be idle.
  "batches",
  "project_queue",
  "play_start_receipts",
  "plan_limit_waits",
  "plan_limit_waiters",
  "prompt_softening",
  "narration_retries",
  "prepared_videos",
  // Carried as files (`files/images/<sha256>`), not rows.
  "image_blobs",
]);

function install(): BackupDeps & { readonly db: DatabaseSync; readonly paths: Paths } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-backup-new-")));
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
    appVersion: "3.0.0",
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

const png = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const pngHash = createHash("sha256").update(png).digest("hex");

function seed(db: DatabaseSync): void {
  const at = "2026-09-20T10:00:00.000Z";
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
  run(
    "INSERT INTO channels(id,name,is_default,brand_json,series_brief,version,episode_memory,ai_disclosure,created_at,updated_at) VALUES ('c2','Night stories',0,?,?,3,1,'yes',?,?)",
    JSON.stringify({
      captionColor: "#FFD700",
      links: [{ name: "Discord", url: "https://discord.test/night" }],
    }),
    "Calm stories for sleep.",
    at,
    at,
  );
  run(
    "UPDATE channels SET name='Main',series_brief='History explained',version=2 WHERE id=?",
    defaultChannelId,
  );
  run(
    "INSERT INTO cast_members(id,channel_id,kind,name,aliases_json,description,voice_json,version,created_at,updated_at) VALUES ('m1','c2','character','Mira','[\"the fox\"]','A red fox.',?,1,?,?)",
    JSON.stringify({ provider: "openai", model: "tts-1", voice: "alloy" }),
    at,
    at,
  );
  run(
    "INSERT INTO image_blobs(sha256,mime,bytes,created_at) VALUES (?,'image/png',?,?)",
    pngHash,
    png,
    at,
  );
  run(
    "INSERT INTO cast_images(id,member_id,source,prompt,state,error,sha256,created_at) VALUES ('i1','m1','upload',NULL,'ready',NULL,?,?)",
    pngHash,
    at,
  );
  run(
    "INSERT INTO project_channels(project_id,channel_id) VALUES ('p1','c2') ON CONFLICT(project_id) DO UPDATE SET channel_id='c2'",
  );
  run(
    "INSERT INTO episode_memories(id,channel_id,project_id,title,summary,cast_json,source,created_at,updated_at) VALUES ('em1','c2','p1','Episode one','Mira finds the lantern.','[\"Mira\"]','edited',?,?)",
    at,
    at,
  );
  run(
    "INSERT INTO channel_videos(id,channel_id,title,created_at) VALUES ('v1','c2','The old lantern',?)",
    at,
  );
  run(
    "INSERT INTO prompts(id,kind,name,body,slots,updated_at) VALUES ('pr1','article','Story','Tell it.','[]',?)",
    at,
  );
  run(
    "INSERT INTO prompts(id,kind,name,body,slots,updated_at,deleted_at) VALUES ('pr2','article','Story','Old words.','[]',?,?)",
    at,
    at,
  );
  run(
    "INSERT INTO library_versions(item_kind,item_id,version,kind,mode,name,body,author,restored_from,created_at) VALUES ('prompt','pr1',1,'article',NULL,'Story','First.','you',NULL,?),('prompt','pr1',2,'article',NULL,'Story','Tell it.','you',NULL,?)",
    at,
    at,
  );
  run(
    "INSERT INTO review_verdicts(id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,created_at) VALUES ('rv1','p1','r1','article:body','article','f','rf',1,'[]','passed',1,?)",
    at,
  );
  run(
    "INSERT INTO provider_usage(id,project_id,stage,kind,provider,model,wall_ms,cost,created_at) VALUES ('u1','p1','article','llm','openai','gpt',1200,0.02,?)",
    at,
  );
  run(
    "INSERT INTO plan_limit_readings(id,project_id,account,reading_json,created_at) VALUES ('pl1','p1','codex','{}',?)",
    at,
  );
  run("INSERT INTO project_trash(project_id,deleted_at) VALUES ('p1',?)", at);
  run(
    "INSERT INTO standalone_usage(id,owner_kind,owner_id,channel_id,purpose,kind,provider,model,wall_ms,cost,created_at) VALUES ('su1','channel','c1','c1','episode-summary','llm','openai','gpt',900,0.01,?)",
    at,
  );
  writeSetting(db, "channel_links", JSON.stringify([{ name: "Patreon", url: "https://x.test" }]));
  writeSetting(db, "provider.defaults", JSON.stringify({ llm: { provider: "codex", model: "" } }));
  // The AI use marks and the channel's import filter.
  writeSetting(db, "voices.realPerson", JSON.stringify(["voice-1"]));
  writeSetting(db, "library.photorealisticPrompts", JSON.stringify(["prompt-1"]));
  writeSetting(db, "studio.realFootage", JSON.stringify(["p1"]));
  writeSetting(db, "channels.importFilter.c2", JSON.stringify("Lore"));
  // A channel's own Studio playlist travels; what waits to be filled in Studio does not.
  writeSetting(db, "studio.playlist.c2", JSON.stringify("Lore tales"));
  writeSetting(db, "studio.fillQueue.0123456789abcdef", JSON.stringify([]));
}

const rows = (db: DatabaseSync, sql: string) => db.prepare(sql).all();

describe("backups carry everything added since 2.5.0", () => {
  it("names every table as carried or left out on purpose", () => {
    const { db } = install();
    const carried = new Set<string>([...projectTables, ...libraryTables, ...usageTables]);
    const tables = rows(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    ).map((row) => String(row.name));
    expect(tables.filter((table) => !carried.has(table) && !leftOut.has(table))).toEqual([]);
    expect([...leftOut].filter((table) => carried.has(table))).toEqual([]);
  });

  it("round-trips channels, cast pictures, memories, videos, history, reviews, run cost and trash", async () => {
    const source = install();
    seed(source.db);
    const archive = await exported(source);
    expect(Buffer.from(archive).toString("latin1")).toContain(`files/images/${pngHash}`);

    const target = install();
    const summary = await importBackup(target, once(archive));
    expect(summary.projects.imported).toEqual([{ id: "p1", title: "Episode one" }]);
    expect(summary.channels).toEqual({ added: 2, renamed: 0, skipped: 0 });
    expect(summary.cast).toEqual({ added: 1, renamed: 0, skipped: 0 });
    expect(summary.episodeMemories).toEqual({ added: 1, renamed: 0, skipped: 0 });
    expect(summary.channelVideos).toEqual({ added: 1, renamed: 0, skipped: 0 });
    expect(summary.prompts).toEqual({ added: 2, renamed: 0, skipped: 0 });

    const same = (sql: string) => expect(rows(target.db, sql)).toEqual(rows(source.db, sql));
    same("SELECT * FROM channels ORDER BY id");
    // Each channel's own links travel in its brand kit; the default channel reads the older
    // Settings list until its Brand tab is saved.
    expect(readChannelLinksFor(target.db, "c2")).toEqual([
      { name: "Discord", url: "https://discord.test/night" },
    ]);
    expect(readChannelLinksFor(target.db, defaultChannelId)).toEqual([
      { name: "Patreon", url: "https://x.test" },
    ]);
    same("SELECT * FROM cast_members ORDER BY id");
    same("SELECT * FROM cast_images ORDER BY id");
    same("SELECT sha256,mime,hex(bytes) AS bytes FROM image_blobs ORDER BY sha256");
    same("SELECT * FROM episode_memories ORDER BY id");
    same("SELECT * FROM channel_videos ORDER BY id");
    same("SELECT * FROM prompts ORDER BY id");
    same("SELECT * FROM library_versions ORDER BY item_id,version");
    same("SELECT * FROM project_channels ORDER BY project_id");
    same("SELECT * FROM review_verdicts ORDER BY id");
    same("SELECT * FROM provider_usage ORDER BY id");
    same("SELECT * FROM plan_limit_readings ORDER BY id");
    same("SELECT * FROM project_trash ORDER BY project_id");
    same("SELECT * FROM standalone_usage ORDER BY id");
    same(
      "SELECT key,value FROM settings WHERE key IN ('channel_links','provider.defaults','voices.realPerson','library.photorealisticPrompts','studio.realFootage','channels.importFilter.c2','studio.playlist.c2') ORDER BY key",
    );
    expect(rows(target.db, "SELECT key FROM settings WHERE key LIKE 'studio.fillQueue.%'")).toEqual(
      [],
    );
    expect(rows(target.db, "SELECT value FROM settings WHERE key = 'studio.playlist.c2'")).toEqual([
      { value: JSON.stringify("Lore tales") },
    ]);

    // Imported twice: nothing is added again.
    const again = await importBackup(target, once(archive));
    expect(again.channels).toEqual({ added: 0, renamed: 0, skipped: 2 });
    expect(again.cast).toEqual({ added: 0, renamed: 0, skipped: 1 });
    expect(again.episodeMemories).toEqual({ added: 0, renamed: 0, skipped: 1 });
    expect(again.channelVideos).toEqual({ added: 0, renamed: 0, skipped: 1 });
    expect(rows(target.db, "SELECT count(*) AS n FROM library_versions")).toEqual([{ n: 2 }]);
    expect(rows(target.db, "SELECT count(*) AS n FROM standalone_usage")).toEqual([{ n: 1 }]);
  });

  it("keeps a default channel this install already edited, and merges cast into it by id", async () => {
    const source = install();
    seed(source.db);
    const target = install();
    target.db.prepare("UPDATE channels SET name='Mine',version=2 WHERE id=?").run(defaultChannelId);
    target.db
      .prepare(
        "INSERT INTO channels(id,name,is_default,created_at,updated_at) VALUES ('c2','Stories here',0,'t','t')",
      )
      .run();
    target.db
      .prepare(
        "INSERT INTO channel_videos(id,channel_id,title,created_at) VALUES ('here','c2','THE OLD LANTERN','t')",
      )
      .run();
    const summary = await importBackup(target, once(await exported(source)));
    expect(summary.channels).toEqual({ added: 0, renamed: 0, skipped: 2 });
    expect(rows(target.db, "SELECT id,name FROM channels ORDER BY id")).toEqual([
      { id: defaultChannelId, name: "Mine" },
      { id: "c2", name: "Stories here" },
    ]);
    expect(summary.cast).toEqual({ added: 1, renamed: 0, skipped: 0 });
    expect(rows(target.db, "SELECT channel_id FROM cast_members")).toEqual([{ channel_id: "c2" }]);
    // Same title in the same channel, whatever the case: kept once.
    expect(summary.channelVideos).toEqual({ added: 0, renamed: 0, skipped: 1 });
  });

  it("refuses a picture whose bytes don't match its name", async () => {
    const source = install();
    seed(source.db);
    const archive = Buffer.from(await exported(source));
    const at = archive.indexOf(png, archive.indexOf(`files/images/${pngHash}`) + 512);
    archive[at + 3] = 0x00;
    const target = install();
    await expect(importBackup(target, once(archive))).rejects.toThrow(
      `the picture ${pngHash} in it is damaged`,
    );
    expect(rows(target.db, "SELECT count(*) AS n FROM image_blobs")).toEqual([{ n: 0 }]);
  });
});
