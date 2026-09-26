import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { ensureDirs, layout, type Paths } from "../../kernel/paths.js";
import { insertProject } from "../admission/repo.js";
import { insertPrompt, listPrompts } from "../library/repo.js";
import { upsertKey, writeSetting } from "../settings/repo.js";
import { insertTelemetryEvent } from "../telemetry/repo.js";
import { type BackupDeps, busySentence, planBackup, streamBackup } from "./backup-export.js";
import { BackupImportRefused, importBackup, importedName } from "./backup-import.js";
import { readTar, TarFormatError, tarEnd, tarHeader, tarPadding } from "./tar.js";

const clock = fixedClock("2026-09-20T10:00:00.000Z");
const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

function install(): BackupDeps & { readonly db: DatabaseSync; readonly paths: Paths } {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-backup-")));
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
    appVersion: "2.2.0",
  };
}

function project(deps: ReturnType<typeof install>, id: string, title: string): void {
  insertProject(deps.db, {
    id,
    title,
    format: "16:9",
    config: {
      title,
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
    createdAt: clock.now().toISOString(),
    updatedAt: clock.now().toISOString(),
  });
  deps.db
    .prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,?,'article','provide','provided')",
    )
    .run(`${id}-article`, id);
  mkdirSync(join(deps.paths.projects, id, "images"), { recursive: true });
  writeFileSync(join(deps.paths.projects, id, "article.md"), `# ${title}\n`);
  writeFileSync(join(deps.paths.projects, id, "images", "001.png"), Buffer.alloc(700, 7));
}

function prompt(deps: ReturnType<typeof install>, id: string, name: string, body: string): void {
  insertPrompt(deps.db, { id, kind: "article", name, body, slots: [], updatedAt: "t" });
}

async function exported(deps: BackupDeps): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of streamBackup(planBackup(deps))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function* once(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  // Odd-sized pieces, the way a socket hands them over.
  for (let at = 0; at < bytes.byteLength; at += 777) yield bytes.subarray(at, at + 777);
}

// biome-ignore lint/suspicious/noExplicitAny: the tests tamper with parts of a real backup as loose JSON.
type Loose = any;

interface Member {
  name: string;
  content: Uint8Array;
}

async function members(archive: Uint8Array): Promise<Member[]> {
  const out: Member[] = [];
  await readTar(once(archive), async (entry, body) => {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body.chunks()) chunks.push(chunk);
    out.push({ name: entry.name, content: Buffer.concat(chunks) });
  });
  return out;
}

function pack(list: readonly Member[]): Uint8Array {
  return Buffer.concat(
    list
      .flatMap((member) => [
        tarHeader({ name: member.name, size: member.content.byteLength }),
        member.content,
        new Uint8Array(tarPadding(member.content.byteLength)),
      ])
      .concat([tarEnd]),
  );
}

function editJson(list: Member[], name: string, edit: (value: Loose) => unknown): Member[] {
  return list.map((member) =>
    member.name === name
      ? {
          name,
          content: Buffer.from(
            JSON.stringify(edit(JSON.parse(Buffer.from(member.content).toString()))),
          ),
        }
      : member,
  );
}

async function refusal(deps: BackupDeps, archive: Uint8Array): Promise<BackupImportRefused> {
  try {
    await importBackup(deps, once(archive));
  } catch (error) {
    if (error instanceof BackupImportRefused) return error;
    throw error;
  }
  throw new Error("The import was accepted");
}

function untouched(target: ReturnType<typeof install>): void {
  expect(target.db.prepare("SELECT count(*) AS n FROM projects").get()).toEqual({ n: 0 });
  expect(target.db.prepare("SELECT count(*) AS n FROM prompts").get()).toEqual({ n: 0 });
  expect(target.db.prepare("SELECT count(*) AS n FROM telemetry_events").get()).toEqual({ n: 0 });
  expect(readdirSync(target.paths.projects)).toEqual([]);
  expect(readdirSync(join(target.paths.dataDir, "imports"))).toEqual([]);
}

describe("the tar container", () => {
  it("round-trips long names and keeps each file's bytes", async () => {
    const long = `files/projects/p/${"a".repeat(150)}/video.mp4`;
    const list = [
      { name: "manifest.json", content: Buffer.from("{}") },
      { name: long, content: Buffer.alloc(1025, 3) },
    ];
    expect(await members(pack(list))).toEqual(list);
  });

  it("refuses a damaged header and an archive cut short", async () => {
    const archive = pack([{ name: "a.txt", content: Buffer.from("hello") }]);
    const damaged = Uint8Array.from(archive);
    damaged[10] = 0x41;
    await expect(members(damaged)).rejects.toBeInstanceOf(TarFormatError);
    await expect(members(archive.subarray(0, 700))).rejects.toBeInstanceOf(TarFormatError);
  });
});

describe("export", () => {
  it("never puts a provider key, the machine id or the install event in the archive", async () => {
    const source = install();
    upsertKey(source.db, "openrouter", "sk-or-v1-secret-key-value", "t");
    source.db
      .prepare("INSERT INTO machine(machine_id,notice_seen_at,app_version) VALUES (?,?,?)")
      .run("machine-uuid-0001", "t", "2.2.0");
    insertTelemetryEvent(source.db, {
      id: "install-event",
      type: "install",
      payload: { appVersion: "2.2.0" },
      createdAt: "t",
      deliveredAt: null,
    });
    writeSetting(source.db, "tutorial.session", JSON.stringify({ step: 1 }));

    const archive = await exported(source);
    const text = Buffer.from(archive).toString("latin1");
    for (const secret of [
      "sk-or-v1-secret-key-value",
      "machine-uuid-0001",
      "install-event",
      "provider_keys",
      "tutorial.session",
    ])
      expect(text).not.toContain(secret);
    expect((await members(archive)).map((member) => member.name)).toEqual([
      "manifest.json",
      "data/library.json",
      "data/usage.json",
      "checksums.json",
    ]);
  });

  it("waits for projects that are being made and names them", () => {
    const source = install();
    project(source, "p1", "Rope knots");
    source.db.prepare("UPDATE stages SET state='running' WHERE project_id='p1'").run();
    expect(() => planBackup(source)).toThrow(busySentence([{ id: "p1", title: "Rope knots" }]));
    expect(busySentence([{ id: "p1", title: "Rope knots" }])).toContain(
      "pause them on their project page",
    );
  });

  it("announces its exact length and carries every file of every project", async () => {
    const source = install();
    project(source, "p1", "One");
    const plan = planBackup(source);
    const archive = await exported(source);
    expect(archive.byteLength).toBe(plan.archiveBytes);
    expect((await members(archive)).map((member) => member.name)).toEqual([
      "manifest.json",
      "data/library.json",
      "data/usage.json",
      "data/projects/p1.json",
      "files/projects/p1/article.md",
      "files/projects/p1/images/001.png",
      "checksums.json",
    ]);
  });
});

describe("import validation", () => {
  it("refuses a backup from a newer Slopify before reading anything else", async () => {
    const source = install();
    const target = install();
    const list = await members(await exported(source));
    for (const edit of [
      (manifest: Loose) => ({ ...manifest, schemaVersion: 3, somethingNew: true }),
      (manifest: Loose) => ({ ...manifest, databaseVersion: 999 }),
    ]) {
      const refused = await refusal(target, pack(editJson(list, "manifest.json", edit)));
      expect(refused.message).toBe(
        "This backup was made by a newer Slopify (2.2.0). Update Slopify first (npx @gentbajko/slopify@latest, or pull the latest Docker image), then import it again.",
      );
    }
    untouched(target);
  });

  it("refuses parts out of order, unlisted files and damaged bytes, writing nothing", async () => {
    const source = install();
    project(source, "p1", "One");
    prompt(source, "pr1", "Deep", "Go deep.");
    const target = install();
    const list = await members(await exported(source));
    const swapped = [list[1], list[0], ...list.slice(2)] as Member[];
    expect((await refusal(target, pack(swapped))).message).toContain("its parts are out of order");
    const extra = [
      ...list.slice(0, -1),
      { name: "files/projects/p1/evil.sh", content: Buffer.from("x") },
      ...list.slice(-1),
    ];
    expect((await refusal(target, pack(extra))).message).toContain("doesn't name");
    const flipped = list.map((member) =>
      member.name.endsWith("001.png") ? { ...member, content: Buffer.alloc(700, 8) } : member,
    );
    expect((await refusal(target, pack(flipped))).message).toContain("doesn't match the checksum");
    expect((await refusal(target, pack(list.slice(0, -1)))).message).toContain("cut short");
    const foreign = editJson(list, "data/projects/p1.json", (part) => ({
      ...part,
      tables: { ...part.tables, stages: [{ ...part.tables.stages[0], project_id: "other" }] },
    }));
    expect((await refusal(target, pack(foreign))).message).toContain("another project's records");
    const invalid = editJson(list, "data/library.json", (part) => ({
      ...part,
      tables: { ...part.tables, prompts: [{ ...part.tables.prompts[0], kind: "poem" }] },
    }));
    expect((await refusal(target, pack(invalid))).message).toContain("can't read");
    const escaping = editJson(list, "data/projects/p1.json", (part) => ({
      ...part,
      files: [{ path: "../../slopify.db", bytes: 1 }],
    }));
    expect((await refusal(target, pack(escaping))).message).toContain("can't read");
    untouched(target);
  });

  it("carries rows from an older database forward with this build's migrations", async () => {
    const source = install();
    project(source, "p1", "Old");
    const list = await members(await exported(source));
    // As Slopify 2.1 would have written it: schema 13, before the Document stage existed.
    const old = editJson(
      editJson(list, "manifest.json", (manifest) => ({ ...manifest, databaseVersion: 13 })),
      "data/projects/p1.json",
      (part) => ({
        ...part,
        tables: {
          ...part.tables,
          stages: part.tables.stages.filter((row: { kind: string }) => row.kind !== "document"),
        },
      }),
    );
    const target = install();
    const summary = await importBackup(target, once(pack(old)));
    expect(summary.projects.imported).toEqual([{ id: "p1", title: "Old" }]);
    // Migration 14 gives every project it finds a switched-off Document stage.
    expect(
      target.db
        .prepare("SELECT source,state FROM stages WHERE project_id='p1' AND kind='document'")
        .get(),
    ).toEqual({ source: "off", state: "skipped" });
  });
});

describe("import merge rules", () => {
  it("adds without replacing: renames clashes, skips duplicates, fills only unset settings", async () => {
    const source = install();
    project(source, "p1", "Shared");
    project(source, "p2", "New");
    prompt(source, "pr-same-id", "Kept", "Mine.");
    prompt(source, "pr-identical", "Twin", "Same words.");
    prompt(source, "pr-clash", "Clash", "Their words.");
    writeSetting(source.db, "appearance", JSON.stringify("dark"));
    writeSetting(source.db, "silenceGapSeconds", JSON.stringify(4));
    source.db
      .prepare(
        "INSERT INTO telemetry_events(id,type,payload,created_at,delivered_at) VALUES ('e1','project.created',?,'t',NULL)",
      )
      .run(JSON.stringify({ appVersion: "2.2.0" }));
    const archive = await exported(source);

    const target = install();
    project(target, "p1", "Shared");
    prompt(target, "pr-same-id", "Kept", "Edited here.");
    prompt(target, "pr-other-twin", "Twin", "Same words.");
    prompt(target, "pr-other-clash", "Clash", "Our words.");
    writeSetting(target.db, "appearance", JSON.stringify("light"));

    const summary = await importBackup(target, once(archive));
    expect(summary.projects).toEqual({
      imported: [{ id: "p2", title: "New" }],
      skipped: [{ id: "p1", title: "Shared", reason: "It is already in this install." }],
    });
    expect(summary.prompts).toEqual({ added: 0, renamed: 1, skipped: 2 });
    expect(Object.fromEntries(listPrompts(target.db).map((one) => [one.name, one.body]))).toEqual({
      Kept: "Edited here.",
      Twin: "Same words.",
      Clash: "Our words.",
      "Clash (imported)": "Their words.",
    });
    expect(summary.settings).toEqual({ added: 1, kept: 1 });
    expect(target.db.prepare("SELECT value FROM settings WHERE key='appearance'").get()).toEqual({
      value: '"light"',
    });
    // The project that was already here keeps its own files; the new one brings its own.
    expect(existsSync(join(target.paths.projects, "p2", "images", "001.png"))).toBe(true);
    expect(summary.usage).toEqual({ events: 1, alreadyImported: false });

    const again = await importBackup(target, once(archive));
    expect(again.usage).toEqual({ events: 0, alreadyImported: true });
    expect(again.projects.imported).toEqual([]);
    expect(target.db.prepare("SELECT count(*) AS n FROM telemetry_events").get()).toEqual({ n: 1 });
  });

  it("names an imported copy within the length limit and past earlier copies", () => {
    const taken = new Set(["Clash (imported)"]);
    expect(importedName("Clash", 200, (name) => taken.has(name))).toBe("Clash (imported 2)");
    expect(importedName("x".repeat(200), 200, () => false)).toHaveLength(200);
  });
});
