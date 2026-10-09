import { readdirSync, rmSync, statSync, unlinkSync } from "node:fs";
import { isAbsolute, join, relative, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { adoptMarked, markerProject, projectMarker } from "./arrange.js";
import { backupsFolderName, outputPath, stagingPath } from "./layout.js";
import { stagedFiles as stagedRows } from "./repo.js";
import { stagedFileReferenced } from "./staging-refs.js";

export interface Reconciled {
  readonly orphanFiles: number;
  readonly stagedFiles: number;
}

export function reconcileStorage(db: DatabaseSync, paths: Paths): Reconciled {
  const projects = idsOf(db, "SELECT id FROM projects", "id");
  const folders = new Map<string, string>();
  for (const project of projects) {
    const folder = paths.places?.folderOf(project);
    if (folder !== undefined) folders.set(folder.toLowerCase(), project);
  }
  const kept = new Set<string>();
  for (const row of db
    .prepare(
      "SELECT project_id, path FROM outputs UNION SELECT project_id, path FROM project_assets",
    )
    .all()) {
    const projectId = row.project_id;
    const path = row.path;
    if (typeof projectId === "string" && typeof path === "string") {
      outputPath(paths, projectId, path);
      kept.add(`${projectId}/${slashed(placed(paths, projectId, path))}`);
    }
  }

  // A stage's unfinished work is on the project too: the audio chunks a previous run
  // finished are kept so a manual retry re-runs only the failed ones, and a cancel keeps
  // them as well. A chunk is not an output - the concatenated body is the project's only
  // body audio - so the file it wrote is named by its `stage_pieces` payload instead, and
  // that is as much of a record as an outputs row.
  for (const row of db
    .prepare(
      "SELECT stages.project_id AS project_id, stage_pieces.payload AS payload FROM stage_pieces JOIN stages ON stages.id = stage_pieces.stage_id WHERE stage_pieces.payload IS NOT NULL",
    )
    .all()) {
    const projectId = row.project_id;
    const file = pieceFile(row.payload);
    if (typeof projectId === "string" && file !== undefined) {
      kept.add(`${projectId}/${slashed(placed(paths, projectId, file))}`);
    }
  }

  let orphanFiles = 0;
  // A Projects folder outside the data dir (in Documents, from 3.0) is one the user browses,
  // and the system drops its own files there (.DS_Store, desktop.ini). Only folders are
  // Slopify's in it, so a loose file stays; hidden entries stay everywhere.
  const userVisible = !within(paths.dataDir, paths.projects);
  for (const entry of readdirSync(paths.projects, { withFileTypes: true })) {
    const path = join(paths.projects, entry.name);
    // The scheduled backups' default folder: its archives belong to slices/backups, which
    // prunes them by its own rules.
    if (entry.name === backupsFolderName && entry.isDirectory()) continue;
    if (entry.name.startsWith(".") || osFiles.has(entry.name.toLowerCase())) continue;
    if (!entry.isDirectory() && userVisible) continue;
    if (!entry.isDirectory()) {
      unlinkSync(path);
      orphanFiles += 1;
      continue;
    }
    // A folder is a project's by its readable name (`places.ts`), its id, or the marker
    // arranging left in it (`arrange.ts`). A deleted project's folder goes; a folder that is
    // none of these is the person's own and stays.
    const owner = folderOwner(db, paths, projects, folders, entry.name, path);
    if (owner === "foreign") continue;
    if (owner === "deleted") {
      orphanFiles += filesUnder(path).length;
      rmSync(path, { recursive: true, force: true });
      continue;
    }
    for (const file of filesUnder(path)) {
      const name = slashed(file);
      if (kept.has(`${owner}/${name}`)) continue;
      // The marker, and anything in the folders a person browses: a note or a file dropped
      // next to the video is theirs. Only Slopify's own leftovers elsewhere are removed.
      if (name === projectMarker || arrangedArea.test(name)) continue;
      unlinkSync(join(path, file));
      orphanFiles += 1;
    }
  }

  const retained = new Set<string>();
  for (const file of stagedRows(db)) {
    if (!stagedFileReferenced(db, file.id)) continue;
    const stat = statSync(stagingPath(paths, file.path), { throwIfNoEntry: false });
    if (file.state === "staged" && stat?.isFile() && stat.size === file.bytes) {
      retained.add(file.path);
      db.prepare(
        "UPDATE play_draft_attachments SET status='ready',error=NULL WHERE staged_file_id=?",
      ).run(file.id);
    } else {
      db.prepare(
        "UPDATE play_draft_attachments SET staged_file_id=NULL,status='reattach',error=? WHERE staged_file_id=?",
      ).run("Upload is missing or incomplete. Reattach the file.", file.id);
    }
  }
  db.prepare(
    "UPDATE play_draft_attachments SET status='reattach',error=? WHERE status IN ('ready','pending') AND staged_file_id IS NULL",
  ).run("Upload is missing or incomplete. Reattach the file.");
  let stagedFiles = 0;
  for (const file of filesUnder(paths.staging)) {
    if (retained.has(file)) continue;
    unlinkSync(join(paths.staging, file));
    stagedFiles += 1;
  }
  db.exec(
    "DELETE FROM staged_files WHERE NOT EXISTS (SELECT 1 FROM play_draft_attachments WHERE staged_file_id=staged_files.id)",
  );

  return { orphanFiles, stagedFiles };
}

// The one field read inside a payload whose shape belongs to the stage that wrote it: a
// project-relative path the piece left on disk. A payload without one is any other kind
// of piece and names no file. Exported because a re-run drops the same pieces the boot
// sweep keeps, and the two have to agree on which file a piece is holding.
export function pieceFile(payload: unknown): string | undefined {
  if (typeof payload !== "string") {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return undefined;
  }
  if (typeof parsed !== "object" || parsed === null || !("file" in parsed)) {
    return undefined;
  }
  const file: unknown = parsed.file;
  return typeof file === "string" && file !== "" ? file : undefined;
}

// Where a stored path is on disk now, relative to its project folder.
function placed(paths: Paths, projectId: string, path: string): string {
  return paths.places?.placeOf(projectId, path) ?? path;
}

// The folders arranging makes (`arrange.ts`): a file in them that no record names is the
// person's, not a leftover.
const arrangedArea = /^(Upload|Working|History)\//u;

const ulid = /^[0-9A-HJKMNP-TV-Z]{26}$/u;

// Whose a folder in the projects root is: a project's id, "deleted" (a project that no longer
// exists: its id, or its marker's), or "foreign" (not Slopify's).
function folderOwner(
  db: DatabaseSync,
  paths: Paths,
  projects: ReadonlySet<string>,
  folders: ReadonlyMap<string, string>,
  name: string,
  path: string,
): string {
  const named = folders.get(name.toLowerCase());
  if (named !== undefined) return named;
  const marked = markerProject(path);
  if (marked !== undefined) {
    if (!projects.has(marked)) return "deleted";
    // The database lost this folder's record (restored from before it was arranged): its
    // marker says whose it is, and where its files went.
    if (paths.places !== undefined && paths.places.folderOf(marked) === undefined) {
      adoptMarked(db, paths, marked, name, path);
      return marked;
    }
    return paths.places?.folderOf(marked)?.toLowerCase() === name.toLowerCase()
      ? marked
      : "foreign";
  }
  if (projects.has(name)) return paths.places?.folderOf(name) === undefined ? name : "foreign";
  return ulid.test(name) ? "deleted" : "foreign";
}

function idsOf(db: DatabaseSync, sql: string, column: string): Set<string> {
  const ids = new Set<string>();
  for (const row of db.prepare(sql).all()) {
    const id = row[column];
    if (typeof id === "string") {
      ids.add(id);
    }
  }
  return ids;
}

function filesUnder(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      files.push(relative(root, join(entry.parentPath, entry.name)));
    }
  }
  return files;
}

const osFiles = new Set(["desktop.ini", "thumbs.db"]);

function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return (
    inside === "" || (inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside))
  );
}

// outputs.path is stored with forward slashes; the filesystem may hand back backslashes.
function slashed(path: string): string {
  return path.split(sep).join("/");
}
