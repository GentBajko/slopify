import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statfsSync } from "node:fs";
import { open } from "node:fs/promises";
import { dirname, join } from "node:path";
import { DatabaseSync, type SQLInputValue, type StatementSync } from "node:sqlite";
import { ZodError, type z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { migrate, newestMigration } from "../../kernel/db/migrate.js";
import { transact } from "../../kernel/db/tx.js";
import { projectById } from "../admission/repo.js";
import { documentThemeNameMax, documentThemeNameProblems } from "../document/model.js";
import { documentThemeSchema } from "../document/theme-schema.js";
import { nameMax } from "../library/model.js";
import { playDraftDocumentSchema } from "../play-drafts/schema.js";
import { projectTemplateSchema } from "../project-templates/schema.js";
import { revisionById } from "../revisions/repo.js";
import { runsForSchedule, scheduleRows } from "../schedules/repo.js";
import { allTelemetryEvents } from "../telemetry/repo.js";
import { type BackupDeps, projectRows, rowsOf } from "./backup-export.js";
import {
  type BackupManifest,
  type BackupRow,
  backupMaxJsonBytes,
  backupMaxManifestBytes,
  backupSchemaVersion,
  checksumsMember,
  checksumsSchema,
  fontMember,
  type LibraryPart,
  libraryMember,
  libraryPartSchema,
  libraryTables,
  manifestHead,
  manifestMember,
  manifestSchema,
  type ProjectPart,
  projectFileMember,
  projectMember,
  projectPartSchema,
  projectTables,
  stagedMember,
  type UsagePart,
  usageMember,
  usagePartSchema,
  usageTables,
} from "./backup-format.js";
import { outputPath, projectDir, stagingPath } from "./layout.js";
import {
  checkLibraryRows,
  exportableSettings,
  installedUploadedFontFiles,
  validFontContent,
} from "./portable.js";
import { readTar, type TarBody, TarFormatError } from "./tar.js";

// Importing a full backup adds to this install and never takes anything away:
//
// - a project whose id is already here (the same backup imported twice, or a backup of this
//   very install) is skipped and reported, never overwritten or duplicated. Copying it under
//   new ids would mean rewriting ids inside every revision, fingerprint and file name, and a
//   copy nobody asked for is not worth that risk;
// - a prompt, intro/outro, document theme or template whose id is already here is skipped; one
//   whose name is taken by a different item comes in as "<name> (imported)", and one
//   identical to what is here is skipped;
// - settings only fill in what this install has not set;
// - schedules come in paused, so two installs never both run the same one;
// - usage history is added once per backup (its id is recorded), and never sent to
//   slopify.stream again: the install that made it already counted it there;
// - provider keys and this install's telemetry id are never in a backup to begin with.
//
// Every JSON part is checked before any file is written. Files stream to a folder of their
// own under imports/, and are moved into place in the same synchronous step that commits the
// rows, so a failed import leaves the install as it was.

const importing = new WeakSet<DatabaseSync>();

export class BackupImportRefused extends Error {
  constructor(
    message: string,
    readonly status: 400 | 409 | 422 = 400,
  ) {
    super(message);
  }
}

const chooseAgain =
  "Choose a .tar file made with Export everything in Settings → Backup & storage, or export it again.";

function damaged(why: string): BackupImportRefused {
  return new BackupImportRefused(`This backup can't be imported: ${why} ${chooseAgain}`);
}

export interface ItemCounts {
  readonly added: number;
  readonly renamed: number;
  readonly skipped: number;
}

export interface BackupImportSummary {
  readonly backup: {
    readonly id: string;
    readonly createdAt: string;
    readonly appVersion: string;
  };
  readonly projects: {
    readonly imported: readonly { readonly id: string; readonly title: string }[];
    readonly skipped: readonly {
      readonly id: string;
      readonly title: string;
      readonly reason: string;
    }[];
  };
  readonly prompts: ItemCounts;
  readonly entries: ItemCounts;
  readonly documentThemes: ItemCounts;
  readonly templates: ItemCounts;
  readonly schedules: ItemCounts & { readonly paused: number };
  readonly voices: ItemCounts;
  readonly drafts: ItemCounts;
  readonly settings: { readonly added: number; readonly kept: number };
  readonly fonts: number;
  readonly usage: { readonly events: number; readonly alreadyImported: boolean };
  readonly files: { readonly count: number; readonly bytes: number };
}

interface Expected {
  readonly bytes: number;
  // Where the file waits until the commit; undefined when the import skips it.
  readonly destination: string | undefined;
  readonly font?: { readonly id: string; readonly extension: ".ttf" | ".otf" };
}

interface Prepared {
  readonly scratch: DatabaseSync;
  readonly projects: ReadonlySet<string>;
  readonly skippedProjects: ReadonlyMap<string, string>;
  readonly drafts: ReadonlySet<string>;
}

export async function importBackup(
  deps: BackupDeps,
  source: AsyncIterable<Uint8Array>,
): Promise<BackupImportSummary> {
  if (importing.has(deps.db))
    throw new BackupImportRefused(
      "Another backup is still being imported. Wait for it to finish, then import this one.",
      409,
    );
  importing.add(deps.db);
  const imports = join(deps.paths.dataDir, "imports");
  // A folder left by an import the app was stopped in the middle of holds nothing the
  // database points at.
  rmSync(imports, { recursive: true, force: true });
  const work = join(imports, deps.ids.next());
  mkdirSync(work, { recursive: true, mode: 0o700 });
  let prepared: Prepared | undefined;
  try {
    let manifest: BackupManifest | undefined;
    let library: LibraryPart | undefined;
    let usage: UsagePart | undefined;
    const parts: ProjectPart[] = [];
    const expected = new Map<string, Expected>();
    const received = new Map<string, string>();
    let checksums: ReadonlyMap<string, string> | undefined;
    const ready = (): void => {
      if (manifest === undefined || library === undefined || usage === undefined) return;
      prepared = prepare(deps, work, manifest, library, usage, parts, expected);
    };
    await readTar(source, async (entry, body) => {
      if (checksums !== undefined) throw damaged("it has files after its checksum list.");
      if (manifest === undefined) {
        expectMember(entry.name, manifestMember);
        manifest = readManifest(await readJson(body, entry.size, backupMaxManifestBytes));
        return;
      }
      if (library === undefined) {
        expectMember(entry.name, libraryMember);
        library = part(libraryPartSchema, await readJson(body, entry.size), "library");
        return;
      }
      if (usage === undefined) {
        expectMember(entry.name, usageMember);
        usage = part(usagePartSchema, await readJson(body, entry.size), "usage history");
        if (manifest.projects.length === 0) ready();
        return;
      }
      const next = manifest.projects[parts.length];
      if (next !== undefined) {
        expectMember(entry.name, projectMember(next.id));
        const project = part(projectPartSchema, await readJson(body, entry.size), next.title);
        if (project.id !== next.id)
          throw damaged(`the part for "${next.title}" is another project's.`);
        parts.push(project);
        if (parts.length === manifest.projects.length) ready();
        return;
      }
      if (entry.name === checksumsMember) {
        const list = part(checksumsSchema, await readJson(body, entry.size), "checksum list");
        checksums = new Map(list.files.map((file) => [file.member, file.sha256]));
        return;
      }
      const file = expected.get(entry.name);
      if (file === undefined || received.has(entry.name))
        throw damaged(`it holds a file its contents list doesn't name (${entry.name}).`);
      if (entry.size !== file.bytes) throw damaged(`${entry.name} is not the size its list says.`);
      received.set(entry.name, await receive(body, file));
    });
    if (manifest === undefined || prepared === undefined || checksums === undefined)
      throw damaged(
        "the file ends before the backup does; it was probably cut short while downloading.",
      );
    for (const name of expected.keys()) {
      const digest = received.get(name);
      if (digest === undefined) throw damaged(`${name} is missing from it.`);
      if (checksums.get(name) !== digest)
        throw damaged(`${name} doesn't match the checksum it was saved with; the file is damaged.`);
    }
    if (checksums.size !== expected.size)
      throw damaged("its checksum list names files it doesn't hold.");
    return commit(deps, work, manifest, prepared);
  } catch (error) {
    throw asRefusal(error);
  } finally {
    prepared?.scratch.close();
    rmSync(work, { recursive: true, force: true });
    importing.delete(deps.db);
  }
}

function asRefusal(error: unknown): unknown {
  if (error instanceof BackupImportRefused) return error;
  if (error instanceof TarFormatError)
    return damaged(`it is not a complete archive (${error.message})`);
  if (error instanceof ZodError) return damaged("it has a record Slopify can't read.");
  return error;
}

function expectMember(actual: string, wanted: string): void {
  if (actual !== wanted)
    throw damaged(`its parts are out of order (found ${actual} where ${wanted} belongs).`);
}

async function readJson(body: TarBody, size: number, max = backupMaxJsonBytes): Promise<unknown> {
  if (size > max) throw damaged("one of its parts is larger than any backup Slopify writes.");
  const chunks: Uint8Array[] = [];
  for await (const chunk of body.chunks()) chunks.push(chunk);
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw damaged("one of its parts is not readable JSON.");
  }
}

function readManifest(value: unknown): BackupManifest {
  const head = manifestHead.safeParse(value);
  if (!head.success) throw damaged("it has no Slopify backup manifest.");
  const newer = new BackupImportRefused(
    `This backup was made by a newer Slopify (${head.data.appVersion}). Update Slopify first (npx @gentbajko/slopify@latest, or pull the latest Docker image), then import it again.`,
    422,
  );
  if (head.data.schemaVersion > backupSchemaVersion) throw newer;
  const manifest = part(manifestSchema, value, "manifest");
  if (manifest.databaseVersion > newestMigration()) throw newer;
  const ids = new Set(manifest.projects.map((project) => project.id));
  if (ids.size !== manifest.projects.length) throw damaged("it lists a project twice.");
  return manifest;
}

function part<T extends z.ZodType>(schema: T, value: unknown, name: string): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw damaged(`its ${name} part has a record Slopify can't read.`);
  return parsed.data;
}

async function receive(body: TarBody, file: Expected): Promise<string> {
  const hash = createHash("sha256");
  if (file.font !== undefined) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of body.chunks()) {
      hash.update(chunk);
      chunks.push(chunk);
    }
    const content = Buffer.concat(chunks);
    if (!validFontContent(file.font.id, file.font.extension, content))
      throw damaged(`the uploaded font ${file.font.id} in it is damaged.`);
    if (file.destination !== undefined) {
      mkdirSync(dirname(file.destination), { recursive: true, mode: 0o700 });
      const handle = await open(file.destination, "wx", 0o600);
      try {
        await handle.write(content);
      } finally {
        await handle.close();
      }
    }
    return hash.digest("hex");
  }
  if (file.destination === undefined) {
    for await (const chunk of body.chunks()) hash.update(chunk);
    return hash.digest("hex");
  }
  mkdirSync(dirname(file.destination), { recursive: true, mode: 0o700 });
  const handle = await open(file.destination, "wx", 0o600);
  try {
    for await (const chunk of body.chunks()) {
      hash.update(chunk);
      await handle.write(chunk);
    }
  } finally {
    await handle.close();
  }
  return hash.digest("hex");
}

// Loads every row into a scratch database at the schema the backup was written with, carries
// it forward with this build's migrations, and checks it with the same readers the app uses.
// Then decides which projects and drafts come in, and where each kept file waits.
function prepare(
  deps: BackupDeps,
  work: string,
  manifest: BackupManifest,
  library: LibraryPart,
  usage: UsagePart,
  parts: readonly ProjectPart[],
  expected: Map<string, Expected>,
): Prepared {
  const scratch = loadScratch(deps.clock, manifest, library, usage, parts);
  try {
    checkScratch(deps, scratch, library, parts);
    const projects = new Set<string>();
    const skippedProjects = new Map<string, string>();
    for (const project of parts) {
      const conflict = projectConflict(deps, scratch, project.id);
      if (conflict === undefined) projects.add(project.id);
      else skippedProjects.set(project.id, conflict);
    }
    const drafts = new Set(
      rowsOf(scratch, "SELECT id FROM play_drafts")
        .map((row) => String(row.id))
        .filter((id) => draftConflict(deps, scratch, id) === undefined),
    );
    const keptStaged = new Set(
      rowsOf(
        scratch,
        "SELECT staged_file_id AS id FROM play_draft_attachments WHERE staged_file_id IS NOT NULL",
      )
        .filter((row) => drafts.has(draftOfStaged(scratch, String(row.id))))
        .map((row) => String(row.id)),
    );

    const expect = (member: string, value: Expected): void => {
      if (expected.has(member)) throw damaged(`it lists ${member} twice.`);
      expected.set(member, value);
    };
    let needed = 0;
    for (const project of parts) {
      const keep = projects.has(project.id);
      if (keep) mkdirSync(join(work, "projects", project.id), { recursive: true, mode: 0o700 });
      for (const file of project.files) {
        expect(projectFileMember(project.id, file.path), {
          bytes: file.bytes,
          destination: keep ? join(work, "projects", project.id, file.path) : undefined,
        });
        if (keep) needed += file.bytes;
      }
    }
    const installed = new Set(installedUploadedFontFiles(deps.paths).map((font) => font.name));
    for (const font of library.fonts) {
      const match = /^(uploaded-[a-f0-9]{64})(\.ttf|\.otf)$/.exec(font.name);
      const id = match?.[1];
      const extension = match?.[2];
      if (id === undefined || (extension !== ".ttf" && extension !== ".otf"))
        throw damaged("it names an uploaded font wrongly.");
      const keep =
        !installed.has(font.name) && !existsSync(join(deps.paths.dataDir, "fonts", font.name));
      expect(fontMember(font.name), {
        bytes: font.bytes,
        destination: keep ? join(work, "fonts", font.name) : undefined,
        font: { id, extension },
      });
    }
    for (const staged of library.staged) {
      const keep = keptStaged.has(staged.id);
      expect(stagedMember(staged.id), {
        bytes: staged.bytes,
        destination: keep ? join(work, "staging", staged.id) : undefined,
      });
      if (keep) needed += staged.bytes;
    }
    checkFreeSpace(deps.paths.dataDir, needed);
    return { scratch, projects, skippedProjects, drafts };
  } catch (error) {
    scratch.close();
    throw error;
  }
}

function loadScratch(
  clock: Clock,
  manifest: BackupManifest,
  library: LibraryPart,
  usage: UsagePart,
  parts: readonly ProjectPart[],
): DatabaseSync {
  const scratch = new DatabaseSync(":memory:");
  try {
    migrate(scratch, clock, { through: manifest.databaseVersion });
    // Rows arrive table by table, so a child may come before its parent; every link is
    // checked once they are all in.
    scratch.exec("PRAGMA foreign_keys = OFF");
    const columns = new Map<string, ReadonlySet<string>>();
    const insert = (table: string, row: BackupRow): void => {
      let known = columns.get(table);
      if (known === undefined) {
        known = new Set(
          scratch
            .prepare("SELECT name FROM pragma_table_info(?)")
            .all(table)
            .map((column) => String(column.name)),
        );
        columns.set(table, known);
      }
      if (known.size === 0 || Object.keys(row).some((column) => !known.has(column)))
        throw damaged(`it has ${table} records that don't fit the Slopify version it names.`);
      try {
        insertRow(scratch, table, row);
      } catch {
        throw damaged(`it has a ${table} record Slopify can't read.`);
      }
    };
    for (const table of libraryTables)
      for (const row of library.tables[table] ?? []) insert(table, row);
    for (const table of usageTables)
      for (const row of usage.tables[table] ?? []) if (row.type !== "install") insert(table, row);
    for (const project of parts) {
      const stages = new Set((project.tables.stages ?? []).map((row) => row.id));
      const work = new Set((project.tables.revision_work ?? []).map((row) => row.id));
      for (const table of projectTables)
        for (const row of project.tables[table] ?? []) {
          const owned =
            table === "projects"
              ? row.id === project.id
              : table === "attempts" || table === "stage_pieces"
                ? stages.has(row.stage_id ?? null)
                : table === "revision_work_pieces"
                  ? work.has(row.work_id ?? null)
                  : row.project_id === project.id;
          if (!owned) throw damaged(`the part for one project holds another project's records.`);
          insert(table, row);
        }
    }
    try {
      migrate(scratch, clock);
    } catch {
      // A table rebuild checks every link before it commits; a backup whose links are
      // broken fails there, and the upgrade's own message would talk about downgrading.
      throw damaged("some of its records point at records it doesn't hold.");
    }
    if (scratch.prepare("PRAGMA foreign_key_check").all().length > 0)
      throw damaged("some of its records point at records it doesn't hold.");
    return scratch;
  } catch (error) {
    scratch.close();
    throw error;
  }
}

// The same readers the screens use, so nothing comes in that would break a list later.
function checkScratch(
  deps: BackupDeps,
  scratch: DatabaseSync,
  library: LibraryPart,
  parts: readonly ProjectPart[],
): void {
  const unreadable = (what: string): BackupImportRefused =>
    damaged(`it has ${what} Slopify can't read.`);
  try {
    checkLibraryRows({
      prompts: rowsOf(scratch, "SELECT * FROM prompts"),
      entries: rowsOf(scratch, "SELECT * FROM entries"),
      voices: rowsOf(scratch, "SELECT * FROM voices"),
    });
  } catch {
    throw unreadable("a prompt, intro, outro or voice");
  }
  try {
    for (const row of rowsOf(
      scratch,
      "SELECT t.id AS id,r.version AS version,r.name AS name,t.created_at AS createdAt,r.created_at AS updatedAt,r.document_json AS document FROM project_template_revisions r JOIN project_templates t ON t.id=r.template_id",
    ))
      projectTemplateSchema.parse({ ...row, document: JSON.parse(String(row.document)) });
    const headless = scratch
      .prepare(
        "SELECT 1 FROM project_templates t WHERE NOT EXISTS (SELECT 1 FROM project_template_revisions r WHERE r.template_id=t.id AND r.version=t.head_version)",
      )
      .get();
    if (headless !== undefined) throw new Error("template without its current version");
  } catch {
    throw unreadable("a project template");
  }
  try {
    for (const row of rowsOf(scratch, "SELECT name,values_json FROM document_themes")) {
      documentThemeSchema.parse(JSON.parse(String(row.values_json)));
      if (documentThemeNameProblems(String(row.name)).length > 0) throw new Error("name");
    }
  } catch {
    throw unreadable("a document theme");
  }
  try {
    for (const schedule of scheduleRows(scratch)) runsForSchedule(scratch, schedule.id);
  } catch {
    throw unreadable("a schedule");
  }
  try {
    for (const row of rowsOf(scratch, "SELECT document_json FROM play_drafts"))
      playDraftDocumentSchema.parse(JSON.parse(String(row.document_json)));
    const staged = new Map(library.staged.map((file) => [file.id, file.bytes]));
    const rows = rowsOf(scratch, "SELECT id,path,bytes,state FROM staged_files");
    if (
      rows.length !== staged.size ||
      rows.some(
        (row) =>
          row.path !== row.id || row.state !== "staged" || staged.get(String(row.id)) !== row.bytes,
      )
    )
      throw new Error("staged files");
  } catch {
    throw unreadable("a Play draft");
  }
  try {
    allTelemetryEvents(scratch);
  } catch {
    throw unreadable("usage history");
  }
  for (const project of parts) {
    try {
      if (projectById(scratch, project.id) === undefined) throw new Error("project");
      for (const row of rowsOf(
        scratch,
        "SELECT id FROM project_revisions WHERE project_id=?",
        project.id,
      ))
        revisionById(scratch, project.id, String(row.id));
      for (const row of rowsOf(
        scratch,
        "SELECT path FROM outputs WHERE project_id=? UNION ALL SELECT path FROM project_assets WHERE project_id=?",
        project.id,
        project.id,
      ))
        outputPath(deps.paths, project.id, String(row.path));
    } catch {
      const title = rowsOf(scratch, "SELECT title FROM projects WHERE id=?", project.id)[0]?.title;
      throw unreadable(`a project ("${String(title ?? project.id)}")`);
    }
  }
}

function projectConflict(deps: BackupDeps, scratch: DatabaseSync, id: string): string | undefined {
  if (deps.db.prepare("SELECT 1 FROM projects WHERE id=?").get(id) !== undefined)
    return "It is already in this install.";
  if (existsSync(projectDir(deps.paths, id)))
    return "Its folder is already in the projects folder without a project. Press Clean orphan files in Settings → Backup & storage, then import again.";
  for (const table of projectTables)
    for (const row of projectRows(scratch, table, id))
      if (
        typeof row.id === "string" &&
        deps.db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(row.id) !== undefined
      )
        return "Some of its records have the same ids as records already in this install.";
  return undefined;
}

function draftConflict(deps: BackupDeps, scratch: DatabaseSync, id: string): string | undefined {
  if (deps.db.prepare("SELECT 1 FROM play_drafts WHERE id=?").get(id) !== undefined)
    return "already here";
  for (const row of rowsOf(
    scratch,
    "SELECT id,staged_file_id FROM play_draft_attachments WHERE draft_id=?",
    id,
  )) {
    if (deps.db.prepare("SELECT 1 FROM play_draft_attachments WHERE id=?").get(String(row.id)))
      return "clash";
    const staged = row.staged_file_id;
    if (
      typeof staged === "string" &&
      (deps.db.prepare("SELECT 1 FROM staged_files WHERE id=?").get(staged) !== undefined ||
        existsSync(stagingPath(deps.paths, staged)))
    )
      return "clash";
  }
  return undefined;
}

function draftOfStaged(scratch: DatabaseSync, stagedId: string): string {
  return String(
    scratch
      .prepare("SELECT draft_id FROM play_draft_attachments WHERE staged_file_id=?")
      .get(stagedId)?.draft_id,
  );
}

function checkFreeSpace(dataDir: string, needed: number): void {
  const stats = statfsSync(dataDir);
  const free = Number(stats.bavail) * Number(stats.bsize);
  // Headroom for the database growing by the rows that come with the files.
  if (needed + 64 * 1024 * 1024 > free)
    throw new BackupImportRefused(
      `There isn't enough free space in the Slopify data folder (${dataDir}): this backup needs ${gigabytes(needed)} and ${gigabytes(free)} is free. Free up space on that disk, then import it again.`,
      409,
    );
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1024 ** 3).toFixed(bytes < 1024 ** 3 ? 2 : 1)} GB`;
}

// Everything this install gains, in one transaction; the files waiting under imports/ are
// moved into place inside it, and moved back if it does not commit.
function commit(
  deps: BackupDeps,
  work: string,
  manifest: BackupManifest,
  prepared: Prepared,
): BackupImportSummary {
  const { db, paths } = deps;
  const scratch = prepared.scratch;
  const now = deps.clock.now().toISOString();
  const moved: [string, string][] = [];
  const move = (from: string, to: string): void => {
    mkdirSync(dirname(to), { recursive: true, mode: 0o700 });
    if (existsSync(to)) throw new Error(`${to} appeared during the import.`);
    renameSync(from, to);
    moved.push([from, to]);
  };
  try {
    return transact(db, () => {
      // Rows go in table by table; links are checked when the transaction commits.
      db.exec("PRAGMA defer_foreign_keys = ON");
      const has = (sql: string, ...params: SQLInputValue[]): boolean =>
        db.prepare(sql).get(...params) !== undefined;

      let settingsAdded = 0;
      let settingsKept = 0;
      const stored: Record<string, string> = {};
      for (const row of rowsOf(scratch, "SELECT key,value FROM settings"))
        stored[String(row.key)] = String(row.value);
      for (const [key, value] of Object.entries(exportableSettings(stored))) {
        if (has("SELECT 1 FROM settings WHERE key=?", key)) settingsKept += 1;
        else {
          insertRow(db, "settings", { key, value });
          settingsAdded += 1;
        }
      }

      const prompts = mergeNamed(db, scratch, {
        table: "prompts",
        sameName: "SELECT body FROM prompts WHERE kind=? AND lower(name)=lower(?)",
        key: (row) => [row.kind ?? null],
        same: (row, existing) => existing.body === row.body,
        max: nameMax,
      });
      const entries = mergeNamed(db, scratch, {
        table: "entries",
        sameName: "SELECT mode,body FROM entries WHERE category=? AND lower(name)=lower(?)",
        key: (row) => [row.category ?? null],
        same: (row, existing) => existing.mode === row.mode && existing.body === row.body,
        max: nameMax,
      });
      const documentThemes = mergeNamed(db, scratch, {
        table: "document_themes",
        sameName: "SELECT values_json FROM document_themes WHERE lower(name)=lower(?)",
        key: () => [],
        same: (row, existing) => existing.values_json === row.values_json,
        max: documentThemeNameMax,
      });

      let voicesAdded = 0;
      let voicesSkipped = 0;
      for (const row of rowsOf(scratch, "SELECT * FROM voices ORDER BY rowid")) {
        if (
          has("SELECT 1 FROM voices WHERE id=?", String(row.id)) ||
          has(
            "SELECT 1 FROM voices WHERE provider=? AND voice_id=?",
            String(row.provider),
            String(row.voice_id),
          )
        )
          voicesSkipped += 1;
        else {
          insertRow(db, "voices", row);
          voicesAdded += 1;
        }
      }

      const templates = { added: 0, renamed: 0, skipped: 0 };
      for (const template of rowsOf(scratch, "SELECT * FROM project_templates ORDER BY rowid")) {
        const id = String(template.id);
        if (has("SELECT 1 FROM project_templates WHERE id=?", id)) {
          templates.skipped += 1;
          continue;
        }
        insertRow(db, "project_templates", template);
        let renamed = false;
        for (const revision of rowsOf(
          scratch,
          "SELECT * FROM project_template_revisions WHERE template_id=? ORDER BY version",
          id,
        )) {
          let next = revision;
          if (revision.version === template.head_version) {
            const name = String(revision.name);
            const taken = (candidate: string): boolean =>
              has(
                "SELECT 1 FROM project_templates t JOIN project_template_revisions r ON r.template_id=t.id AND r.version=t.head_version WHERE t.id<>? AND lower(r.name)=lower(?)",
                id,
                candidate,
              );
            if (taken(name)) {
              next = { ...revision, name: importedName(name, 200, taken) };
              renamed = true;
            }
          }
          insertRow(db, "project_template_revisions", next);
        }
        if (renamed) templates.renamed += 1;
        else templates.added += 1;
      }

      const schedules = { added: 0, renamed: 0, skipped: 0, paused: 0 };
      for (const schedule of rowsOf(scratch, "SELECT * FROM schedules ORDER BY rowid")) {
        if (
          has("SELECT 1 FROM schedules WHERE id=?", String(schedule.id)) ||
          !has(
            "SELECT 1 FROM project_template_revisions WHERE template_id=? AND version=?",
            String(schedule.template_id),
            Number(schedule.template_version),
          )
        ) {
          schedules.skipped += 1;
          continue;
        }
        // Two installs running one schedule would make every project twice. It comes in
        // paused; Resume on the Schedules screen starts it here.
        const active = schedule.status === "active";
        insertRow(
          db,
          "schedules",
          active ? { ...schedule, status: "paused", updated_at: now } : schedule,
        );
        if (active) schedules.paused += 1;
        for (const run of rowsOf(
          scratch,
          "SELECT * FROM schedule_runs WHERE schedule_id=? ORDER BY rowid",
          String(schedule.id),
        ))
          if (!has("SELECT 1 FROM schedule_runs WHERE id=?", String(run.id)))
            insertRow(db, "schedule_runs", run);
        schedules.added += 1;
      }

      const drafts = { added: 0, renamed: 0, skipped: 0 };
      for (const draft of rowsOf(scratch, "SELECT * FROM play_drafts ORDER BY rowid")) {
        const id = String(draft.id);
        if (!prepared.drafts.has(id) || draftConflict(deps, scratch, id) !== undefined) {
          drafts.skipped += 1;
          continue;
        }
        insertRow(db, "play_drafts", draft);
        for (const attachment of rowsOf(
          scratch,
          "SELECT * FROM play_draft_attachments WHERE draft_id=? ORDER BY rowid",
          id,
        )) {
          const staged = attachment.staged_file_id;
          if (typeof staged === "string" && !has("SELECT 1 FROM staged_files WHERE id=?", staged)) {
            const row = rowsOf(scratch, "SELECT * FROM staged_files WHERE id=?", staged)[0];
            if (row === undefined) throw new Error("staged file row missing");
            insertRow(db, "staged_files", { ...row, created_at: now });
            move(join(work, "staging", staged), stagingPath(paths, staged));
          }
          insertRow(db, "play_draft_attachments", attachment);
        }
        for (const row of rowsOf(
          scratch,
          "SELECT * FROM project_template_instantiations WHERE draft_id=?",
          id,
        ))
          insertRow(db, "project_template_instantiations", row);
        drafts.added += 1;
      }

      let fonts = 0;
      const fontDir = join(work, "fonts");
      if (existsSync(fontDir))
        for (const name of readdirSync(fontDir)) {
          const target = join(paths.dataDir, "fonts", name);
          if (existsSync(target)) continue;
          move(join(fontDir, name), target);
          fonts += 1;
        }

      const alreadyImported = has(
        "SELECT 1 FROM backup_imports WHERE backup_id=?",
        manifest.backupId,
      );
      let events = 0;
      if (!alreadyImported)
        for (const event of rowsOf(scratch, "SELECT * FROM telemetry_events ORDER BY rowid")) {
          // Marked delivered: the install that recorded it already counted it (or will).
          const changes = insertRow(
            db,
            "telemetry_events",
            { ...event, delivered_at: event.delivered_at ?? now },
            "INSERT OR IGNORE",
          );
          events += changes;
        }

      const imported: { id: string; title: string }[] = [];
      const skipped: { id: string; title: string; reason: string }[] = [];
      let count = 0;
      let bytes = 0;
      for (const listed of manifest.projects) {
        const reason =
          prepared.skippedProjects.get(listed.id) ??
          (prepared.projects.has(listed.id)
            ? projectConflict(deps, scratch, listed.id)
            : undefined);
        if (reason !== undefined) {
          skipped.push({ id: listed.id, title: listed.title, reason });
          continue;
        }
        for (const table of projectTables)
          for (const row of projectRows(scratch, table, listed.id)) insertRow(db, table, row);
        const folder = join(work, "projects", listed.id);
        for (const entry of readdirSync(folder, { withFileTypes: true, recursive: true }))
          if (entry.isFile()) count += 1;
        bytes += listed.bytes;
        move(folder, projectDir(paths, listed.id));
        imported.push({ id: listed.id, title: listed.title });
      }

      const summary: BackupImportSummary = {
        backup: {
          id: manifest.backupId,
          createdAt: manifest.createdAt,
          appVersion: manifest.appVersion,
        },
        projects: { imported, skipped },
        prompts,
        entries,
        documentThemes,
        templates,
        schedules,
        voices: { added: voicesAdded, renamed: 0, skipped: voicesSkipped },
        drafts,
        settings: { added: settingsAdded, kept: settingsKept },
        fonts,
        usage: { events, alreadyImported },
        files: { count, bytes },
      };
      db.prepare(
        "INSERT INTO backup_imports(backup_id,imported_at,summary_json) VALUES(?,?,?) ON CONFLICT(backup_id) DO NOTHING",
      ).run(manifest.backupId, now, JSON.stringify(summary));
      return summary;
    });
  } catch (error) {
    for (const [from, to] of moved.toReversed()) {
      try {
        renameSync(to, from);
      } catch {
        // Best effort: the folder under imports/ is removed next, and reconcile removes a
        // project folder whose rows did not commit.
      }
    }
    throw error;
  }
}

// Library items whose name is unique per kind: same id is the same item and is skipped; the
// same name with the same content is skipped; the same name with other content comes in as
// "<name> (imported)".
function mergeNamed(
  db: DatabaseSync,
  scratch: DatabaseSync,
  rule: {
    readonly table: "prompts" | "entries" | "document_themes";
    readonly sameName: string;
    readonly key: (row: BackupRow) => SQLInputValue[];
    readonly same: (row: BackupRow, existing: Record<string, unknown>) => boolean;
    readonly max: number;
  },
): ItemCounts {
  let added = 0;
  let renamed = 0;
  let skipped = 0;
  for (const row of rowsOf(scratch, `SELECT * FROM ${rule.table} ORDER BY rowid`)) {
    if (db.prepare(`SELECT 1 FROM ${rule.table} WHERE id=?`).get(String(row.id)) !== undefined) {
      skipped += 1;
      continue;
    }
    const name = String(row.name);
    const lookup = (candidate: string) =>
      db.prepare(rule.sameName).get(...rule.key(row), candidate);
    const existing = lookup(name);
    if (existing === undefined) {
      insertRow(db, rule.table, row);
      added += 1;
    } else if (rule.same(row, existing)) {
      skipped += 1;
    } else {
      insertRow(db, rule.table, {
        ...row,
        name: importedName(name, rule.max, (candidate) => lookup(candidate) !== undefined),
      });
      renamed += 1;
    }
  }
  return { added, renamed, skipped };
}

export function importedName(name: string, max: number, taken: (name: string) => boolean): string {
  for (let n = 1; ; n += 1) {
    const suffix = n === 1 ? " (imported)" : ` (imported ${n})`;
    const candidate = `${name.slice(0, Math.max(1, max - suffix.length)).trimEnd()}${suffix}`;
    if (!taken(candidate)) return candidate;
  }
}

const statements = new WeakMap<DatabaseSync, Map<string, StatementSync>>();

function insertRow(
  db: DatabaseSync,
  table: string,
  row: BackupRow,
  verb: "INSERT" | "INSERT OR IGNORE" = "INSERT",
): number {
  const columns = Object.keys(row);
  const sql = `${verb} INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`;
  let cache = statements.get(db);
  if (cache === undefined) {
    cache = new Map();
    statements.set(db, cache);
  }
  let statement = cache.get(sql);
  if (statement === undefined) {
    statement = db.prepare(sql);
    cache.set(sql, statement);
  }
  return Number(statement.run(...columns.map((column) => row[column] ?? null)).changes);
}
