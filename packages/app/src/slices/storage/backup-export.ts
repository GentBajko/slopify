import { createHash } from "node:crypto";
import { constants, type Dirent, lstatSync, readdirSync } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { transact } from "../../kernel/db/tx.js";
import type { Ids } from "../../kernel/ids.js";
import type { Paths } from "../../kernel/paths.js";
import {
  type BackupManifest,
  type BackupRow,
  backupFormat,
  backupSchemaVersion,
  checksumsMember,
  fontMember,
  type LibraryPart,
  type LibraryTable,
  libraryMember,
  manifestMember,
  type ProjectPart,
  type ProjectTable,
  projectFileMember,
  projectMember,
  projectTables,
  safeRelativePath,
  stagedMember,
  type UsagePart,
  usageMember,
} from "./backup-format.js";
import { projectDir, stagingPath } from "./layout.js";
import { exportableSettings, installedUploadedFontFiles } from "./portable.js";
import { tarEnd, tarHeader, tarMemberBytes, tarPadding } from "./tar.js";

export interface BackupDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly clock: Clock;
  readonly ids: Ids;
  readonly appVersion: string;
  // In-flight provider calls the database has not recorded yet (kernel/runner).
  readonly hasInflight?: ((projectId: string) => boolean) | undefined;
}

export interface BusyProject {
  readonly id: string;
  readonly title: string;
}

// A project that is being made has half-written files and rows that say "running"; copied
// as they are, the other install would show a run nothing is doing. So a backup waits for
// every project to be finished, paused or canceled, and says which ones it is waiting for.
export class BackupBusyError extends Error {
  constructor(readonly projects: readonly BusyProject[]) {
    super(busySentence(projects));
  }
}

export function busySentence(projects: readonly BusyProject[]): string {
  const named = projects
    .slice(0, 3)
    .map((project) => `"${project.title}"`)
    .join(", ");
  const more = projects.length > 3 ? ` and ${projects.length - 3} more` : "";
  return `Slopify can't export while projects are being made (${named}${more}): their files are still being written. Wait for them to finish, or pause them on their project page, then press Export everything again.`;
}

type Member =
  | { readonly name: string; readonly kind: "bytes"; readonly content: Uint8Array }
  | { readonly name: string; readonly kind: "file"; readonly path: string; readonly size: number };

export interface BackupPlan {
  readonly manifest: BackupManifest;
  readonly members: readonly Member[];
  // The exact length of the archive, sent as Content-Length so the browser shows real progress.
  readonly archiveBytes: number;
  readonly fileName: string;
}

export function busyProjects(deps: Pick<BackupDeps, "db" | "hasInflight">): BusyProject[] {
  return deps.db
    .prepare(
      `SELECT p.id AS id, p.title AS title,
         EXISTS(SELECT 1 FROM stages s WHERE s.project_id=p.id AND s.state='running')
         OR EXISTS(SELECT 1 FROM revision_work w WHERE w.project_id=p.id AND w.state='running')
         OR EXISTS(SELECT 1 FROM project_queue q WHERE q.project_id=p.id AND q.state='queued')
         AS busy
       FROM projects p ORDER BY p.created_at, p.id`,
    )
    .all()
    .flatMap((row) => {
      const id = String(row.id);
      return row.busy === 1 || deps.hasInflight?.(id) === true
        ? [{ id, title: String(row.title) }]
        : [];
    });
}

// Reads everything the backup carries in one read transaction, so the rows agree with each
// other, and sizes every file so the archive's length is known before its first byte.
export function planBackup(deps: BackupDeps): BackupPlan {
  const busy = busyProjects(deps);
  if (busy.length > 0) throw new BackupBusyError(busy);
  const snapshot = transact(deps.db, () => ({
    databaseVersion: databaseVersion(deps.db),
    library: librarySnapshot(deps),
    usage: {
      tables: {
        telemetry_events: rowsOf(
          deps.db,
          "SELECT * FROM telemetry_events WHERE type<>'install' ORDER BY rowid",
        ),
      },
    } satisfies UsagePart,
    projects: deps.db
      .prepare("SELECT id,title FROM projects ORDER BY created_at,id")
      .all()
      .map((row) => projectSnapshot(deps, String(row.id), String(row.title))),
  }));

  const createdAt = deps.clock.now().toISOString();
  const files: Member[] = [];
  for (const project of snapshot.projects)
    for (const file of project.part.files)
      files.push({
        name: projectFileMember(project.part.id, file.path),
        kind: "file",
        path: join(projectDir(deps.paths, project.part.id), file.path),
        size: file.bytes,
      });
  for (const font of snapshot.library.part.fonts)
    files.push({
      name: fontMember(font.name),
      kind: "file",
      path: join(deps.paths.dataDir, "fonts", font.name),
      size: font.bytes,
    });
  for (const staged of snapshot.library.part.staged)
    files.push({
      name: stagedMember(staged.id),
      kind: "file",
      path: stagingPath(deps.paths, staged.id),
      size: staged.bytes,
    });

  const manifest: BackupManifest = {
    format: backupFormat,
    schemaVersion: backupSchemaVersion,
    appVersion: deps.appVersion.slice(0, 40),
    databaseVersion: snapshot.databaseVersion,
    backupId: deps.ids.next(),
    createdAt,
    projects: snapshot.projects.map((project) => ({
      id: project.part.id,
      title: project.title,
      bytes: project.part.files.reduce((sum, file) => sum + file.bytes, 0),
    })),
    files: files.length,
    bytes: files.reduce((sum, file) => sum + (file.kind === "file" ? file.size : 0), 0),
  };
  const members: Member[] = [
    json(manifestMember, manifest),
    json(libraryMember, snapshot.library.part),
    json(usageMember, snapshot.usage),
    ...snapshot.projects.map((project) => json(projectMember(project.part.id), project.part)),
    ...files,
  ];
  const archiveBytes =
    members.reduce(
      (sum, member) =>
        sum +
        tarMemberBytes({
          name: member.name,
          size: member.kind === "bytes" ? member.content.byteLength : member.size,
        }),
      0,
    ) +
    tarMemberBytes({
      name: checksumsMember,
      size: checksumsBytes(files, () => "0".repeat(64)).byteLength,
    }) +
    tarEnd.byteLength;
  return {
    manifest,
    members,
    archiveBytes,
    fileName: `slopify-backup-${createdAt.slice(0, 10)}.tar`,
  };
}

const readChunk = 1024 * 1024;

// The archive, a chunk at a time. Files are read as they are sent, so a two-hour video
// costs one megabyte of memory, not its size. A file that changed size since the plan was
// made ends the stream with an error, and the browser marks the download failed rather
// than saving a backup that would not import.
export async function* streamBackup(plan: BackupPlan): AsyncGenerator<Uint8Array> {
  const digests = new Map<string, string>();
  const files: Member[] = [];
  for (const member of plan.members) {
    const size = member.kind === "bytes" ? member.content.byteLength : member.size;
    yield tarHeader({ name: member.name, size });
    if (member.kind === "bytes") {
      yield member.content;
    } else {
      files.push(member);
      const hash = createHash("sha256");
      const handle = await open(member.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      try {
        const stat = await handle.stat();
        if (!stat.isFile() || stat.size !== member.size) throw changed(member.name);
        let sent = 0;
        while (sent < member.size) {
          const buffer = new Uint8Array(Math.min(readChunk, member.size - sent));
          const { bytesRead } = await handle.read(buffer, 0, buffer.byteLength, sent);
          if (bytesRead === 0) throw changed(member.name);
          const chunk = buffer.subarray(0, bytesRead);
          hash.update(chunk);
          sent += bytesRead;
          yield chunk;
        }
      } finally {
        await handle.close();
      }
      digests.set(member.name, hash.digest("hex"));
    }
    const padding = tarPadding(size);
    if (padding > 0) yield new Uint8Array(padding);
  }
  const checksums = checksumsBytes(files, (name) => digests.get(name) ?? "");
  yield tarHeader({ name: checksumsMember, size: checksums.byteLength });
  yield checksums;
  const padding = tarPadding(checksums.byteLength);
  if (padding > 0) yield new Uint8Array(padding);
  yield tarEnd;
}

function changed(name: string): Error {
  return new Error(`${name} changed while the backup was being written.`);
}

function checksumsBytes(files: readonly Member[], digest: (name: string) => string): Uint8Array {
  return new TextEncoder().encode(
    JSON.stringify({
      files: files.map((file) => ({ member: file.name, sha256: digest(file.name) })),
    }),
  );
}

function json(name: string, value: unknown): Member {
  return { name, kind: "bytes", content: new TextEncoder().encode(JSON.stringify(value)) };
}

function databaseVersion(db: DatabaseSync): number {
  const row = db.prepare("SELECT max(version) AS version FROM schema_migrations").get();
  return Number(row?.version ?? 0);
}

// Every row of one project in one table. The same selection reads the scratch database on
// import, so what is exported and what is copied in are the same rows by construction.
export function projectRows(db: DatabaseSync, table: ProjectTable, projectId: string): BackupRow[] {
  switch (table) {
    case "projects":
      return rowsOf(db, "SELECT * FROM projects WHERE id=?", projectId);
    case "attempts":
    case "stage_pieces":
      return rowsOf(
        db,
        `SELECT * FROM ${table} WHERE stage_id IN (SELECT id FROM stages WHERE project_id=?) ORDER BY rowid`,
        projectId,
      );
    case "revision_work_pieces":
      return rowsOf(
        db,
        "SELECT * FROM revision_work_pieces WHERE work_id IN (SELECT id FROM revision_work WHERE project_id=?) ORDER BY rowid",
        projectId,
      );
    default:
      return rowsOf(db, `SELECT * FROM ${table} WHERE project_id=? ORDER BY rowid`, projectId);
  }
}

function projectSnapshot(
  deps: BackupDeps,
  id: string,
  title: string,
): { readonly title: string; readonly part: ProjectPart } {
  const tables: Partial<Record<ProjectTable, BackupRow[]>> = {};
  for (const table of projectTables) {
    const rows = projectRows(deps.db, table, id);
    if (rows.length > 0) tables[table] = rows;
  }
  return { title, part: { id, tables, files: projectFiles(projectDir(deps.paths, id)) } };
}

// Every plain file under the project's folder, symlinks and all else left out. Not only the
// rows' files: audio chunks a retry would reuse and the files a revision history keeps are
// named inside JSON the backup has no business parsing, and reconcile already removes what
// nothing names.
function projectFiles(root: string): { path: string; bytes: number }[] {
  const out: { path: string; bytes: number }[] = [];
  const walk = (relative: string): void => {
    let entries: Dirent[];
    try {
      entries = readdirSync(join(root, relative), { withFileTypes: true });
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile() && safeRelativePath(path))
        out.push({ path, bytes: lstatSync(join(root, path)).size });
    }
  };
  walk("");
  return out;
}

function librarySnapshot(deps: BackupDeps): { readonly part: LibraryPart } {
  const { db, paths } = deps;
  const tables: Partial<Record<LibraryTable, BackupRow[]>> = {};
  const put = (table: LibraryTable, rows: BackupRow[]): void => {
    if (rows.length > 0) tables[table] = rows;
  };
  const stored: Record<string, string> = {};
  for (const row of db.prepare("SELECT key,value FROM settings ORDER BY key").all())
    stored[String(row.key)] = String(row.value);
  put(
    "settings",
    Object.entries(exportableSettings(stored)).map(([key, value]) => ({ key, value })),
  );
  put("prompts", rowsOf(db, "SELECT * FROM prompts ORDER BY rowid"));
  put("entries", rowsOf(db, "SELECT * FROM entries ORDER BY rowid"));
  put("voices", rowsOf(db, "SELECT * FROM voices ORDER BY rowid"));
  put("document_themes", rowsOf(db, "SELECT * FROM document_themes ORDER BY rowid"));
  put("project_templates", rowsOf(db, "SELECT * FROM project_templates ORDER BY rowid"));
  put(
    "project_template_revisions",
    rowsOf(db, "SELECT * FROM project_template_revisions ORDER BY template_id,version"),
  );
  put("schedules", rowsOf(db, "SELECT * FROM schedules ORDER BY rowid"));
  put("schedule_runs", rowsOf(db, "SELECT * FROM schedule_runs ORDER BY rowid"));

  // Play drafts are work the user typed and has not started yet, so they travel. A draft
  // that already became projects is not: its projects carry it. Its uploads travel with it
  // when they are complete on disk; one that is not comes back asking to be reattached,
  // the same thing a restart does with it.
  const drafts = rowsOf(db, "SELECT * FROM play_drafts WHERE state='active' ORDER BY rowid");
  put("play_drafts", drafts);
  const draftIds = new Set(drafts.map((row) => String(row.id)));
  const attachments = rowsOf(db, "SELECT * FROM play_draft_attachments ORDER BY rowid").filter(
    (row) => draftIds.has(String(row.draft_id)),
  );
  const staged: { id: string; bytes: number }[] = [];
  const stagedRows: BackupRow[] = [];
  const reattach = "Upload is missing or incomplete. Reattach the file.";
  put(
    "play_draft_attachments",
    attachments.map((row) => {
      const stagedId = row.staged_file_id;
      if (typeof stagedId !== "string") return row;
      const file = db.prepare("SELECT * FROM staged_files WHERE id=?").get(stagedId);
      const complete =
        file !== undefined &&
        file.state === "staged" &&
        file.path === stagedId &&
        fileBytes(stagingPath(paths, stagedId)) === file.bytes;
      if (!complete) return { ...row, staged_file_id: null, status: "reattach", error: reattach };
      if (!staged.some((one) => one.id === stagedId)) {
        staged.push({ id: stagedId, bytes: Number(file.bytes) });
        stagedRows.push(toRow(file));
      }
      return row;
    }),
  );
  put("staged_files", stagedRows);
  put(
    "project_template_instantiations",
    rowsOf(db, "SELECT * FROM project_template_instantiations ORDER BY rowid").filter((row) =>
      draftIds.has(String(row.draft_id)),
    ),
  );
  const fonts = installedUploadedFontFiles(paths).map((font) => ({
    name: font.name,
    bytes: font.bytes,
  }));
  return { part: { tables, fonts, staged } };
}

function fileBytes(path: string): number | undefined {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? stat.size : undefined;
  } catch {
    return undefined;
  }
}

export function rowsOf(db: DatabaseSync, sql: string, ...params: string[]): BackupRow[] {
  return db
    .prepare(sql)
    .all(...params)
    .map(toRow);
}

function toRow(row: Record<string, SQLOutputValue>): BackupRow {
  const out: BackupRow = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== null && typeof value !== "string" && typeof value !== "number")
      throw new Error(`Column ${key} holds a value a backup cannot carry.`);
    out[key] = value;
  }
  return out;
}
