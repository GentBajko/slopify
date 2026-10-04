import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { defaultChannelId } from "../channels/model.js";
import { type BackupDeps, planBackup, streamBackup } from "./backup-export.js";
import { importBackup } from "./backup-import.js";
import { readTar, tarEnd, tarHeader, tarPadding } from "./tar.js";

const clock = fixedClock("2026-10-04T10:00:00.000Z");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function install(): BackupDeps & { readonly db: DatabaseSync; readonly paths: Paths } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-backup-cast-")));
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
    ids: { next: () => `id${String(++next).padStart(4, "0")}` },
    appVersion: "3.10.0",
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

function member(db: DatabaseSync, id: string, name: string, position: number): void {
  db.prepare(
    "INSERT INTO cast_members(id,channel_id,kind,name,position,created_at,updated_at) VALUES (?,?,'character',?,?,'t','t')",
  ).run(id, defaultChannelId, name, position);
}

const order = (db: DatabaseSync) =>
  db
    .prepare("SELECT name, position FROM cast_members ORDER BY position, lower(name), id")
    .all()
    .map((row) => `${String(row.name)}:${String(row.position)}`);

it("carries the cast's order, after the members this install already has", async () => {
  const source = install();
  member(source.db, "m1", "Zeno", 0);
  member(source.db, "m2", "Ada", 2);
  member(source.db, "m3", "Mira", 1);
  const archive = await exported(source);

  const fresh = install();
  await importBackup(fresh, once(archive));
  expect(order(fresh.db)).toEqual(["Zeno:0", "Mira:1", "Ada:2"]);

  const busy = install();
  member(busy.db, "here", "Bram", 0);
  await importBackup(busy, once(archive));
  expect(order(busy.db)).toEqual(["Bram:0", "Zeno:1", "Mira:2", "Ada:3"]);
});

it("gives a backup from before the order the alphabetical order it showed", async () => {
  const source = install();
  member(source.db, "m1", "Zeno", 0);
  member(source.db, "m2", "Ada", 1);
  member(source.db, "m3", "mira", 2);
  const entries: { name: string; content: Uint8Array }[] = [];
  await readTar(once(await exported(source)), async (entry, body) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body.chunks()) chunks.push(chunk);
    entries.push({ name: entry.name, content: Buffer.concat(chunks) });
  });
  // As Slopify 3.9 wrote it: schema 51, cast rows without a position.
  const old = entries.map((entry) => {
    if (entry.name !== "manifest.json" && entry.name !== "data/library.json") return entry;
    const value = JSON.parse(Buffer.from(entry.content).toString()) as {
      databaseVersion?: number;
      tables?: { cast_members?: Record<string, unknown>[] };
    };
    if (entry.name === "manifest.json") value.databaseVersion = 51;
    else if (value.tables?.cast_members !== undefined)
      value.tables.cast_members = value.tables.cast_members.map(
        ({ position: _position, ...row }) => row,
      );
    return { name: entry.name, content: Buffer.from(JSON.stringify(value)) };
  });
  const archive = Buffer.concat(
    old
      .flatMap((entry) => [
        tarHeader({ name: entry.name, size: entry.content.byteLength }),
        entry.content,
        new Uint8Array(tarPadding(entry.content.byteLength)),
      ])
      .concat([tarEnd]),
  );
  const target = install();
  await importBackup(target, once(archive));
  expect(order(target.db)).toEqual(["Ada:0", "mira:1", "Zeno:2"]);
});
