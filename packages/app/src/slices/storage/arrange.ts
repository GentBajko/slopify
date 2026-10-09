import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, extname, join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Paths } from "../../kernel/paths.js";
import { pickedShortsOf } from "../shorts/clips.js";
import { backupsFolderName, projectDir, renderCacheFolder } from "./layout.js";
import type { ProjectPlaces } from "./places.js";

// Readable project folders. Each project's folder is named after its title, and each of its
// files is put where a person looks for it:
//
//   <Title>/Upload/            the current version's publishable files: video, thumbnails,
//                              subtitles, description, PDF, Shorts/<n> - <title>.mp4
//   <Title>/Working/           what the current version was made from (images, narration,
//                              research, subtitle timing, render settings): made again if lost
//   <Title>/History/<date>/    files of older versions, by the day they were made: delete the
//                              folder to free the space; going back to that version makes them again
//
// Nothing is copied and no stored path changes: files are renamed on disk and `places.ts`
// records where each one went. Only a project with nothing running or waiting to run is
// arranged, so no step loses a file it is using.

export interface ArrangeDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly places: ProjectPlaces;
  readonly now: () => Date;
}

// The file in each project folder that says which project it is, for when the database and
// the folders disagree (a restored database, a folder renamed by hand). Reconcile keeps it.
export const projectMarker = ".slopify-project";

export interface Arranged {
  readonly folder: string | undefined;
  readonly moved: number;
  readonly skipped: string | undefined;
}

// What makes a project's arrangement current: its title, head version and files. A project
// whose key is unchanged since it was last arranged is left alone.
export function arrangeKeys(db: DatabaseSync): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  for (const row of db
    .prepare(
      `SELECT p.id, p.title, h.revision_id,
        (SELECT count(*)||':'||COALESCE(max(a.id),'') FROM project_assets a WHERE a.project_id=p.id) AS assets,
        (SELECT count(*)||':'||COALESCE(max(o.id),'') FROM outputs o WHERE o.project_id=p.id) AS legacy,
        (SELECT count(*)||':'||COALESCE(max(r.id),'') FROM revision_outputs r WHERE r.project_id=p.id AND r.selected=1 AND r.revision_id=h.revision_id) AS current
       FROM projects p LEFT JOIN project_heads h ON h.project_id=p.id`,
    )
    .all())
    keys.set(
      String(row.id),
      [row.title, row.revision_id, row.assets, row.legacy, row.current].map(String).join("|"),
    );
  return keys;
}

// Whether anything of the project runs or may start: its files stay where they are until then.
export function projectSettled(db: DatabaseSync, projectId: string): boolean {
  const busy = db
    .prepare(
      `SELECT 1 FROM revision_work w WHERE w.project_id=? AND (w.state='running' OR (w.state='pending' AND w.dispatch_state!='held'
         -- A deferred "…:future" stand-in stays pending after its real steps have run; the run
         -- leaves it out (rebuild/runtime-store.ts executionStages), so it is not work to wait for.
         AND EXISTS(SELECT 1 FROM revision_work_pieces p WHERE p.work_id=w.id AND p.work_key NOT LIKE '%:future')))
       UNION ALL SELECT 1 FROM stages WHERE project_id=? AND state='running'
       UNION ALL SELECT 1 FROM project_trash WHERE project_id=? LIMIT 1`,
    )
    .get(projectId, projectId, projectId);
  return busy === undefined;
}

export function arrangeProject(deps: ArrangeDeps, projectId: string): Arranged {
  const { db, paths, places } = deps;
  if (!projectSettled(db, projectId))
    return { folder: places.folderOf(projectId), moved: 0, skipped: "busy" };
  const project = db.prepare("SELECT title FROM projects WHERE id=?").get(projectId);
  if (project === undefined) return { folder: undefined, moved: 0, skipped: "missing" };
  const current = projectDir(paths, projectId);
  if (!existsSync(current)) return { folder: undefined, moved: 0, skipped: "no folder" };

  // 1. The folder, named after the title.
  const have = places.folderOf(projectId) ?? projectId;
  const want = folderName(String(project.title), (name) => taken(db, paths, projectId, have, name));
  if (want !== have && want.toLowerCase() !== have.toLowerCase()) {
    places.moves.folder(projectId, want, places.folderOf(projectId));
    try {
      renameSync(current, join(paths.projects, want));
      places.moves.folderDone(projectId);
    } catch {
      places.moves.folderUndone(projectId);
      return { folder: have, moved: 0, skipped: "folder in use" };
    }
  } else if (places.folderOf(projectId) === undefined) {
    // Already readable (or the same name): still recorded, so cleanup knows it is ours.
    places.moves.folder(projectId, have, undefined);
    places.moves.folderDone(projectId);
  }
  const root = projectDir(paths, projectId);

  // 2. Each file to its place. Files leaving for History go first, so the new version takes
  // the names they free ("video.mp4", not "video (2).mp4").
  const desired = [...desiredPlaces(db, projectId)].toSorted(
    ([, a], [, b]) => Number(!a.startsWith("History/")) - Number(!b.startsWith("History/")),
  );
  const placed = places.placesOf(projectId);
  let moved = 0;
  for (const [path, base] of desired) {
    const at = placed.get(path) ?? path;
    if (sameBase(at, base) || !existsSync(join(root, at))) continue;
    const to = freeName(base, (name) => existsSync(join(root, name)));
    places.moves.file(projectId, path, to, placed.get(path));
    try {
      mkdirSync(dirname(join(root, to)), { recursive: true });
      renameSync(join(root, at), join(root, to));
      places.moves.fileDone(projectId, path);
      moved += 1;
    } catch {
      // In use (a player or download on Windows): it stays and is tried again next time.
      places.moves.fileUndone(projectId, path);
    }
  }
  removeEmptyFolders(root);
  writeMarker(root, projectId, places.placesOf(projectId));
  return { folder: places.folderOf(projectId), moved, skipped: undefined };
}

// Every project whose title, version or files changed since it was last arranged.
// Stops once `budgetMs` has passed, so a pass on the server's thread stays short; the next
// pass carries on where it stopped.
export function arrangeChanged(
  deps: ArrangeDeps,
  budgetMs = Number.POSITIVE_INFINITY,
): readonly string[] {
  const started = performance.now();
  const done: string[] = [];
  for (const [projectId, key] of arrangeKeys(deps.db)) {
    if (performance.now() - started > budgetMs) break;
    if (deps.places.moves.arrangedKey(projectId) === key) continue;
    const result = arrangeProject(deps, projectId);
    if (result.skipped === undefined) {
      deps.places.moves.arranged(projectId, key);
      done.push(projectId);
    }
  }
  return done;
}

// ----- names -------------------------------------------------------------------------------

const reserved = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/iu;

// A folder name every system accepts, from the project's title: "Lolth | D&D Lore To Sleep
// To" becomes "Lolth - D&D Lore To Sleep To".
export function folderName(title: string, isTaken: (name: string) => boolean): string {
  let name = title
    .replace(/\s*[|/\\:]\s*/gu, " - ")
    .replace(/[*?"<>\p{Cc}]/gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/u, "");
  if (name.length > 90) name = name.slice(0, 90).replace(/[. ]+$/u, "");
  if (name === "" || name.startsWith(".")) name = `Project ${name.replace(/^\.+/u, "")}`.trim();
  if (reserved.test(name) || name.toLowerCase() === backupsFolderName.toLowerCase())
    name = `${name} (project)`;
  return freeName(name, isTaken);
}

function taken(
  db: DatabaseSync,
  paths: Paths,
  projectId: string,
  own: string,
  name: string,
): boolean {
  if (name.toLowerCase() === own.toLowerCase()) return false;
  if (name.toLowerCase() === renderCacheFolder) return true;
  const row = db
    .prepare("SELECT 1 FROM project_folders WHERE folder=? COLLATE NOCASE AND project_id!=?")
    .get(name, projectId);
  return row !== undefined || existsSync(join(paths.projects, name)) || isId(db, name);
}

function isId(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM projects WHERE id=?").get(name) !== undefined;
}

// "video.mp4", then "video (2).mp4", "video (3).mp4"…
function freeName(name: string, isTaken: (name: string) => boolean): string {
  if (!isTaken(name)) return name;
  const extension = name.includes("/") ? extname(basename(name)) : extname(name);
  const stem = extension === "" ? name : name.slice(0, -extension.length);
  for (let n = 2; ; n++) {
    const next = `${stem} (${String(n)})${extension}`;
    if (!isTaken(next)) return next;
  }
}

function sameBase(at: string, base: string): boolean {
  if (at.toLowerCase() === base.toLowerCase()) return true;
  const extension = extname(base);
  const stem = extension === "" ? base : base.slice(0, -extension.length);
  const pattern = new RegExp(`^${literal(stem)} \\([0-9]+\\)${literal(extension)}$`, "iu");
  return pattern.test(at);
}

function literal(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function clean(text: string): string {
  return text
    .replace(/[|/\\:*?"<>\p{Cc}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/[. ]+$/u, "")
    .slice(0, 80);
}

const pad = (n: number, width = 3) => String(n).padStart(width, "0");

// ----- where each file goes -----------------------------------------------------------------

interface Reference {
  readonly path: string;
  readonly role: string;
  readonly slot: string;
  readonly index: number | undefined;
  readonly short: number | undefined;
  readonly createdAt: string;
  readonly current: boolean;
}

// Stored path → its place (before any " (2)" for a clash).
export function desiredPlaces(db: DatabaseSync, projectId: string): ReadonlyMap<string, string> {
  const head = db
    .prepare("SELECT revision_id FROM project_heads WHERE project_id=?")
    .get(projectId);
  const headId = head === undefined ? undefined : String(head.revision_id);
  const content =
    headId === undefined
      ? undefined
      : db.prepare("SELECT content FROM project_revisions WHERE id=?").get(headId);
  const order = imageOrder(content?.content);
  const titles = shortTitles(db, headId);
  const references = new Map<string, Reference>();
  const add = (reference: Reference) => {
    const old = references.get(reference.path);
    // The current version's use names a file; otherwise its latest use.
    if (
      old === undefined ||
      (reference.current && !old.current) ||
      (reference.current === old.current && reference.createdAt > old.createdAt)
    )
      references.set(reference.path, reference);
  };
  for (const row of db
    .prepare(
      `SELECT a.path, o.slot, o.descriptor, o.created_at, (o.revision_id=? AND o.selected=1) AS current
       FROM revision_outputs o JOIN project_assets a ON a.id=o.asset_id AND a.project_id=o.project_id
       WHERE o.project_id=?`,
    )
    .all(headId ?? null, projectId)) {
    const descriptor = parse(row.descriptor);
    const meta = descriptor?.meta as Record<string, unknown> | undefined;
    add({
      path: String(row.path),
      role: typeof descriptor?.role === "string" ? descriptor.role : "other",
      slot: String(row.slot),
      index: undefined,
      short: typeof meta?.short === "number" ? meta.short : undefined,
      createdAt: String(row.created_at),
      current: row.current === 1,
    });
  }
  for (const row of db
    .prepare(
      `SELECT a.path, p.piece_key, p.descriptor, p.created_at, (p.revision_id=? AND p.selected=1) AS current
       FROM revision_pieces p JOIN project_assets a ON a.id=p.asset_id AND a.project_id=p.project_id
       WHERE p.project_id=?`,
    )
    .all(headId ?? null, projectId)) {
    const descriptor = parse(row.descriptor);
    add({
      path: String(row.path),
      role: `piece:${typeof descriptor?.kind === "string" ? descriptor.kind : "other"}`,
      slot: String(row.piece_key),
      index: typeof descriptor?.idx === "number" ? descriptor.idx : undefined,
      short: undefined,
      createdAt: String(row.created_at),
      current: row.current === 1,
    });
  }
  // A project from before versions: its outputs rows are its files, all current.
  for (const row of db
    .prepare("SELECT path, role, created_at FROM outputs WHERE project_id=?")
    .all(projectId))
    add({
      path: String(row.path),
      role: String(row.role),
      slot: String(row.role),
      index: undefined,
      short: undefined,
      createdAt: String(row.created_at),
      current: headId === undefined,
    });
  const out = new Map<string, string>();
  for (const reference of references.values()) {
    const place = placeFor(reference, order, titles);
    out.set(
      reference.path,
      reference.current
        ? place
        : `History/${day(reference.createdAt)}/${place.replace(/^Upload\//u, "")}`,
    );
  }
  return out;
}

function placeFor(
  reference: Reference,
  order: ReadonlyMap<string, number>,
  titles: ReadonlyMap<number, string>,
): string {
  const file = basename(reference.path);
  const extension = extname(file);
  const slot = reference.slot;
  const segment = /^(?:audio|level|narration:files):(body|intro|outro)/u.exec(slot)?.[1];
  switch (reference.role) {
    case "video":
      return `Upload/video${extension}`;
    case "thumbnail": {
      const n = /^thumbnail:image:([0-9]+)$/u.exec(slot)?.[1];
      return `Upload/thumbnail${n === undefined ? "" : ` ${n}`}${extension}`;
    }
    case "subtitles_srt":
    case "subtitles_vtt":
      return `Upload/subtitles${extension}`;
    case "youtube_description":
      return "Upload/description.txt";
    case "youtube_tags":
      return "Upload/tags.txt";
    case "youtube_titles":
      return "Upload/titles.txt";
    case "youtube_pinned_comment":
      return "Upload/pinned comment.txt";
    case "document_pdf":
      return `Upload/document${extension}`;
    case "article_md":
      return `Upload/article${extension}`;
    case "audio_export":
      return `Upload/audio${extension}`;
    case "short_video": {
      const n = reference.short ?? Number(/^shorts:([0-9]+):/u.exec(slot)?.[1] ?? Number.NaN);
      if (Number.isNaN(n)) return `Upload/Shorts/${file}`;
      const title = titles.get(n);
      return `Upload/Shorts/${String(n)}${title === undefined || title === "" ? "" : ` - ${clean(title)}`}${extension}`;
    }
    case "image":
    case "animated_image": {
      const key = /^image:(.+)$/u.exec(slot)?.[1];
      const at = key === undefined ? undefined : order.get(key);
      return at === undefined
        ? `Working/Images/${file}`
        : `Working/Images/${pad(at + 1)}${extension}`;
    }
    case "short_image": {
      const match = /^shorts:([0-9]+):image:([0-9]+)$/u.exec(slot);
      return match === null
        ? `Working/Shorts/${file}`
        : `Working/Shorts/Short ${match[1]}/image ${match[2]}${extension}`;
    }
    case "figure_card":
      return `Working/Cards/${file}`;
    case "audio_body":
    case "audio_intro":
    case "audio_outro":
      return `Working/Narration/${segment ?? reference.role.slice(6)}${extension}`;
    case "audio_levelled":
      return `Working/Narration/${segment ?? "narration"} levelled${extension}`;
    case "narration_txt":
      return `Working/Narration/${segment ?? "narration"} text${extension}`;
    case "tts_script":
      return `Working/Narration/${segment ?? "narration"} voice script${extension}`;
    case "piece:chunk":
    case "piece:segment":
      return `Working/Narration/Chunks/${segment ?? "body"} ${pad((reference.index ?? 0) + 1)}${extension}`;
    case "notes":
      return `Working/Research/notes${extension}`;
    case "piece:chapter": {
      const n = /:([0-9]+)$/u.exec(slot)?.[1];
      return `Working/Research/chapter ${n ?? file}${n === undefined ? "" : extension}`;
    }
    case "article_txt":
    case "sources":
    case "glossary":
      return `Working/Article/${reference.role === "article_txt" ? "article" : reference.role}${extension}`;
    case "piece:article_written":
      // The joined narration's parts (audio:body:concat), or an article's written parts.
      return segment === undefined
        ? `Working/Article/Parts/${file}`
        : `Working/Narration/Joined/${segment} ${file}`;
    case "instructions": {
      const stage = /^([a-z]+):instructions$/u.exec(slot)?.[1];
      return `Working/Instructions/${stage ?? basename(file, extension)}${extension}`;
    }
    case "subtitle_words":
    case "subtitle_ass":
    case "subtitle_font":
      return `Working/Subtitles/${file}`;
    case "render_params":
    case "shorts":
      return `Working/Render/${file}`;
    default:
      return `Working/Other/${file}`;
  }
}

function imageOrder(content: unknown): ReadonlyMap<string, number> {
  const parsed = parse(content);
  const order = Array.isArray(parsed?.imageOrder) ? parsed.imageOrder : [];
  return new Map(order.map((key, at) => [String(key), at] as const));
}

function shortTitles(db: DatabaseSync, headId: string | undefined): ReadonlyMap<number, string> {
  if (headId === undefined) return new Map();
  const row = db
    .prepare(
      "SELECT descriptor FROM revision_pieces WHERE revision_id=? AND piece_key='shorts:pick' AND selected=1",
    )
    .get(headId);
  const payload = parse(row?.descriptor)?.payload;
  const picked = pickedShortsOf(typeof payload === "string" ? payload : undefined);
  return new Map((picked?.shorts ?? []).map((short) => [short.number, short.title] as const));
}

function day(createdAt: string): string {
  const at = new Date(createdAt);
  if (Number.isNaN(at.getTime())) return "undated";
  return `${String(at.getFullYear())}-${pad(at.getMonth() + 1, 2)}-${pad(at.getDate(), 2)}`;
}

function parse(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

// ----- the folder itself ---------------------------------------------------------------------

// The marker names the project and lists where each of its files went, so a folder can be
// matched back to its project and its files found again even by a database restored from
// before it was arranged (`adoptMarked`). Written whole, then renamed into place.
function writeMarker(root: string, projectId: string, files: ReadonlyMap<string, string>): void {
  const path = join(root, projectMarker);
  const part = `${path}.part`;
  writeFileSync(
    part,
    `${JSON.stringify(
      {
        project: projectId,
        note: "Slopify keeps this file to know which project this folder holds and where its files are. Leave it here.",
        files: Object.fromEntries([...files].toSorted(([a], [b]) => a.localeCompare(b))),
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  renameSync(part, path);
}

function readMarker(dir: string): { project: string; files: Record<string, string> } | undefined {
  const path = join(dir, projectMarker);
  if (!existsSync(path)) return undefined;
  try {
    const parsed = parse(readFileSync(path, "utf8"));
    if (typeof parsed?.project !== "string") return undefined;
    const files: Record<string, string> = {};
    if (typeof parsed.files === "object" && parsed.files !== null)
      for (const [stored, place] of Object.entries(parsed.files))
        if (typeof place === "string") files[stored] = place;
    return { project: parsed.project, files };
  } catch {
    return undefined;
  }
}

// The project a folder's marker names, if it has one.
export function markerProject(dir: string): string | undefined {
  return readMarker(dir)?.project;
}

// Records a marked folder, and the places of its files that are still there, for a project
// the database has no folder for.
export function adoptMarked(
  db: DatabaseSync,
  paths: Paths,
  projectId: string,
  folder: string,
  dir: string,
): void {
  const places = paths.places;
  if (places === undefined || !("moves" in places)) return;
  const moves = (places as ProjectPlaces).moves;
  if (db.prepare("SELECT 1 FROM project_folders WHERE folder=? COLLATE NOCASE").get(folder)) return;
  moves.folder(projectId, folder, undefined);
  moves.folderDone(projectId);
  for (const [stored, place] of Object.entries(readMarker(dir)?.files ?? {})) {
    if (places.placeOf(projectId, stored) !== undefined) continue;
    if (!existsSync(join(dir, place))) continue;
    moves.file(projectId, stored, place, undefined);
    moves.fileDone(projectId, stored);
  }
}

// The empty folders moves leave behind (assets/<id>/), deepest first. The folder itself stays.
function removeEmptyFolders(root: string): void {
  const walk = (dir: string): boolean => {
    let empty = true;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (walk(path)) {
          try {
            rmdirSync(path);
          } catch {
            empty = false;
          }
        } else empty = false;
      } else empty = false;
    }
    return empty;
  };
  if (existsSync(root) && statSync(root).isDirectory()) walk(root);
}
