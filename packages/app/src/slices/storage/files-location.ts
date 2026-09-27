import { createHash } from "node:crypto";
import { createReadStream, type Dirent, lstatSync, readdirSync } from "node:fs";
import {
  access,
  constants,
  copyFile,
  lstat,
  mkdir,
  readdir,
  rename,
  statfs,
  utimes,
} from "node:fs/promises";
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { FilesLayout, Paths } from "../../kernel/paths.js";
import { repoint } from "../../kernel/paths.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { BusyProject } from "./backup-export.js";
import { backupsFolderName } from "./layout.js";

// Where the files a user looks at live: project folders, scheduled backups and anything else
// Slopify saves for them. New installs keep them in <Documents>/Slopify; installs from before
// 3.0 keep them where they were, inside the data dir, until the user moves them from Settings →
// Backup & storage. The database, settings, models and logs always stay in the data dir.
export const filesLocationKey = "files.location";
// A move that was started and not finished: its target, so the next try picks up the files it
// already copied instead of refusing a folder that isn't empty any more.
export const filesMoveKey = "files.move";

export const filesRootName = "Slopify";

const locationSchema = z.discriminatedUnion("kind", [
  // Everything inside the data dir, the way every install before 3.0 kept it. Stored as a kind,
  // not a path, so a data dir moved by hand still finds its projects.
  z.object({ kind: z.literal("data-dir") }).strict(),
  z.object({ kind: z.literal("root"), root: z.string().min(1) }).strict(),
]);
export type FilesLocation = z.infer<typeof locationSchema>;

const moveSchema = z.object({ target: z.string().min(1), from: locationSchema }).strict();

export function filesLayoutOf(location: FilesLocation, dataDir: string): FilesLayout {
  if (location.kind === "root")
    return {
      projects: join(location.root, "Projects"),
      backups: join(location.root, backupsFolderName),
      exports: join(location.root, "Exports"),
    };
  const projects = join(resolve(dataDir), "projects");
  return { projects, backups: join(projects, backupsFolderName), exports: null };
}

export function readFilesLocation(db: DatabaseSync): FilesLocation | undefined {
  const stored = readSetting(db, filesLocationKey);
  if (stored === undefined) return undefined;
  try {
    return locationSchema.parse(JSON.parse(stored));
  } catch {
    throw new Error(
      `Slopify's saved files folder setting is damaged, so it doesn't know where your projects are. Start Slopify once with its files in the data dir by deleting the "${filesLocationKey}" row from the settings table, or restore the database from a backup.`,
    );
  }
}

export interface SettleFilesInput {
  readonly db: DatabaseSync;
  readonly dataDir: string;
  // True when this start created the database: nothing was ever stored anywhere yet.
  readonly fresh: boolean;
  // The system's Documents folder; only asked for a fresh install. Absent keeps the files in
  // the data dir (a custom --data-dir, and tests).
  readonly documents?: (() => Promise<string>) | undefined;
}

// Decides, once per install, where its files live, and remembers it. An install that already
// had a database keeps its files where they are; a new one gets <Documents>/Slopify, or
// "Slopify 2", "Slopify 3"… when that one already holds another install's projects, because
// storage cleanup deletes project folders its own database doesn't know.
export async function settleFilesLocation(input: SettleFilesInput): Promise<FilesLocation> {
  const stored = readFilesLocation(input.db);
  if (stored !== undefined) return stored;
  let location: FilesLocation = { kind: "data-dir" };
  if (input.fresh && input.documents !== undefined) {
    const documents = await input.documents();
    for (let n = 1; n <= 20; n++) {
      const root = join(documents, n === 1 ? filesRootName : `${filesRootName} ${n}`);
      if (await emptyOrMissing(join(root, "Projects"))) {
        location = { kind: "root", root };
        break;
      }
    }
  }
  writeSetting(input.db, filesLocationKey, JSON.stringify(location));
  return location;
}

// Creates the visible folders of a root, so the user finds Projects and Backups the first time
// they look. Exports is only made when something is saved there.
export async function ensureFilesFolders(layout: FilesLayout): Promise<void> {
  await mkdir(layout.projects, { recursive: true });
  await mkdir(layout.backups, { recursive: true });
}

async function emptyOrMissing(path: string): Promise<boolean> {
  const entries = await readdir(path).catch((error: unknown) => {
    if (hasCode(error, "ENOENT")) return [];
    throw error;
  });
  return entries.length === 0;
}

// ----- moving -----------------------------------------------------------------------------

export type MovePhase = "copying" | "verifying" | "failed" | "interrupted" | "done";

export interface MoveProgress {
  readonly target: string;
  readonly phase: MovePhase;
  readonly files: number;
  readonly totalFiles: number;
  readonly bytes: number;
  readonly totalBytes: number;
  readonly error: string | null;
  // After a finished move: the folder that still holds the old copy, for the user to delete.
  readonly oldFolder: string | null;
}

export interface FilesView {
  readonly docker: boolean;
  // The folder the user thinks of as "Slopify's files": the root, or the projects folder of an
  // install that keeps them in the data dir. In Docker, the host's Projects folder.
  readonly folder: string | null;
  readonly projects: string | null;
  readonly backups: string | null;
  readonly exports: string | null;
  readonly inDataDir: boolean;
  // <Documents>/Slopify on this computer, and whether the files are already there. Null in
  // Docker, whose container can't see the host's Documents.
  readonly documentsRoot: string | null;
  readonly inDocuments: boolean;
  readonly move: MoveProgress | null;
  // Docker: the installer command that moves the Projects folder (the container can't move its
  // own mount).
  readonly dockerCommand: string | null;
}

export type Refusal = { readonly ok: false; readonly status: 400 | 409; readonly detail: string };

export interface FilesService {
  readonly view: () => Promise<FilesView>;
  // "documents" is <Documents>/Slopify; anything else is the full path of the new root.
  readonly move: (target: string) => Promise<{ readonly ok: true } | Refusal>;
  readonly open: () => Promise<{ readonly opened: boolean; readonly path: string }>;
  // Finished when the running move (if any) has settled; for tests and shutdown.
  readonly idle: () => Promise<void>;
}

export interface FilesDeps {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly documents: () => Promise<string>;
  readonly busy: () => readonly BusyProject[];
  readonly openFolder?: ((path: string) => Promise<void>) | undefined;
  readonly docker?:
    | {
        readonly hostProjects: string | null;
        readonly hostBackups: string | null;
        readonly openOnHost?: ((path: string, signal: AbortSignal) => Promise<boolean>) | undefined;
      }
    | undefined;
  // The updater's gate: no update starts while files are being moved.
  readonly beginMutation?: (() => (() => void) | undefined) | undefined;
  readonly freeBytes?: ((path: string) => Promise<number>) | undefined;
  readonly platform?: NodeJS.Platform;
  readonly home?: string;
}

export const dockerMoveCommand =
  "npx @gentbajko/slopify@latest update --docker --projects-dir documents";

export function createFilesService(deps: FilesDeps): FilesService {
  let job: { progress: MoveProgress; done: Promise<void> } | undefined;
  let finished: MoveProgress | undefined;
  // From the first check to the start of the copy, so two presses never start two moves.
  let starting = false;

  const location = (): FilesLocation => readFilesLocation(deps.db) ?? { kind: "data-dir" };
  const pending = (): z.infer<typeof moveSchema> | undefined => {
    const stored = readSetting(deps.db, filesMoveKey);
    if (stored === undefined) return undefined;
    try {
      return moveSchema.parse(JSON.parse(stored));
    } catch {
      return undefined;
    }
  };
  const documentsRoot = async (): Promise<string> =>
    join(resolve(await deps.documents()), filesRootName);

  // Checks the target and starts the copy in the background; the view reports its progress.
  const begin = async (requested: string): Promise<{ readonly ok: true } | Refusal> => {
    let target: string;
    try {
      target = requested === "documents" ? await documentsRoot() : requested.trim();
    } catch {
      return {
        ok: false,
        status: 409,
        detail:
          "Slopify couldn't find your Documents folder. Use Choose another folder in Settings → Backup & storage and type the full path of the folder you want instead.",
      };
    }
    const from = location();
    const stored = pending();
    const resuming = stored !== undefined && samePath(stored.target, target);
    const problem = await targetProblem(deps, from, target, resuming);
    if (problem !== undefined) return { ok: false, status: 400, detail: problem };
    target = resolve(target);
    const busy = deps.busy();
    if (busy.length > 0) return { ok: false, status: 409, detail: busyDetail(busy) };
    const release = deps.beginMutation === undefined ? () => {} : deps.beginMutation();
    if (release === undefined)
      return {
        ok: false,
        status: 409,
        detail:
          "Slopify is installing an update right now. Wait for it to restart, then press the button again in Settings → Backup & storage.",
      };
    const pairs = sourcePairs(deps.paths, from, target);
    const free = deps.freeBytes ?? freeBytesAt;
    let needed: number;
    try {
      needed = pairs.reduce((sum, pair) => sum + pendingBytes(pair), 0);
    } catch (error) {
      release();
      throw error;
    }
    const available = await free(nearestExisting(target)).catch(() => Number.POSITIVE_INFINITY);
    if (available < needed + 64 * 1024 * 1024) {
      release();
      return {
        ok: false,
        status: 400,
        detail: `There isn't enough free space for your files in ${target}: they need ${formatBytes(needed)} and the disk has ${formatBytes(available)} free. Free up space there, or choose a folder on another disk with Choose another folder.`,
      };
    }
    writeSetting(deps.db, filesMoveKey, JSON.stringify({ target, from }));
    finished = undefined;
    const progress: MoveProgress = {
      target,
      phase: "copying",
      files: 0,
      totalFiles: 0,
      bytes: 0,
      totalBytes: 0,
      error: null,
      oldFolder: null,
    };
    const current = { progress, done: Promise.resolve() };
    job = current;
    const update = (change: Partial<MoveProgress>) => {
      current.progress = { ...current.progress, ...change };
    };
    current.done = runMove(deps, from, target, pairs, update)
      .then((oldFolder) => {
        finished = { ...current.progress, phase: "done", oldFolder };
      })
      .catch((error: unknown) => {
        finished = {
          ...current.progress,
          phase: "failed",
          error: error instanceof Error ? error.message : String(error),
        };
      })
      .finally(() => {
        job = undefined;
        release();
      });
    return { ok: true };
  };

  return {
    view: async () => {
      if (deps.docker !== undefined)
        return {
          docker: true,
          folder: deps.docker.hostProjects,
          projects: deps.docker.hostProjects,
          backups: deps.docker.hostBackups,
          exports: null,
          inDataDir: false,
          documentsRoot: null,
          inDocuments: false,
          move: null,
          dockerCommand: dockerMoveCommand,
        };
      const here = location();
      const root = await documentsRoot().catch(() => null);
      const stored = pending();
      const move =
        job?.progress ??
        finished ??
        (stored === undefined
          ? null
          : {
              target: stored.target,
              phase: "interrupted" as const,
              files: 0,
              totalFiles: 0,
              bytes: 0,
              totalBytes: 0,
              error: null,
              oldFolder: null,
            });
      return {
        docker: false,
        folder: here.kind === "root" ? here.root : deps.paths.projects,
        projects: deps.paths.projects,
        backups: deps.paths.backups,
        exports: deps.paths.exports,
        inDataDir: here.kind === "data-dir",
        documentsRoot: root,
        inDocuments: here.kind === "root" && root !== null && samePath(here.root, root),
        move,
        dockerCommand: null,
      };
    },

    move: async (requested) => {
      if (deps.docker !== undefined)
        return {
          ok: false,
          status: 409,
          detail: `Slopify runs in Docker here, and a container can't move the folder it was started with. On the computer running Docker, run ${dockerMoveCommand} (or --projects-dir <folder> for another folder); it waits for running work, copies your projects and checks the copy.`,
        };
      if (job !== undefined || starting)
        return {
          ok: false,
          status: 409,
          detail: `Your files are already being moved${job === undefined ? "" : ` to ${job.progress.target}`}. Wait for it to finish; Settings → Backup & storage shows its progress.`,
        };
      starting = true;
      try {
        return await begin(requested);
      } finally {
        starting = false;
      }
    },

    open: async () => {
      if (deps.docker !== undefined) {
        const host = deps.docker.hostProjects;
        if (host === null) throw new Error("No host folder");
        const opened =
          (await deps.docker.openOnHost?.(host, AbortSignal.timeout(10_000)).catch(() => false)) ===
          true;
        return { opened, path: host };
      }
      const here = location();
      const folder = here.kind === "root" ? here.root : deps.paths.projects;
      if (deps.openFolder === undefined) return { opened: false, path: folder };
      await deps.openFolder(folder);
      return { opened: true, path: folder };
    },

    idle: async () => {
      await job?.done;
    },
  };
}

interface Pair {
  readonly from: string;
  readonly to: string;
  // A folder inside `from` that is copied as its own pair (the old Backups inside projects).
  readonly skip: string | null;
}

// What moves where. An install that keeps its files in the data dir has Backups inside its
// projects folder; the new root has it beside Projects.
function sourcePairs(paths: Paths, from: FilesLocation, target: string): Pair[] {
  const next = filesLayoutOf({ kind: "root", root: target }, "");
  const pairs: Pair[] = [
    {
      from: paths.projects,
      to: next.projects,
      skip: from.kind === "data-dir" ? backupsFolderName : null,
    },
    { from: paths.backups, to: next.backups, skip: null },
  ];
  if (paths.exports !== null && next.exports !== null)
    pairs.push({ from: paths.exports, to: next.exports, skip: null });
  return pairs;
}

interface SourceFile {
  readonly path: string;
  readonly size: number;
  readonly mtimeMs: number;
}

// Every regular file under a pair's source, relative to it. Links are left out: Slopify never
// makes one, and following one could copy a folder the user never meant to move.
function sourceFiles(pair: Pair): SourceFile[] {
  const files: SourceFile[] = [];
  const walk = (dir: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      if (hasCode(error, "ENOENT")) return;
      throw error;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (dir === pair.from && entry.name === pair.skip) continue;
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const stat = lstatSync(full);
        files.push({ path: relative(pair.from, full), size: stat.size, mtimeMs: stat.mtimeMs });
      }
    }
  };
  walk(pair.from);
  return files;
}

function pendingBytes(pair: Pair): number {
  let bytes = 0;
  for (const file of sourceFiles(pair)) {
    const there = lstatSync(join(pair.to, file.path), { throwIfNoEntry: false });
    if (!(there?.isFile() && there.size === file.size && there.mtimeMs === file.mtimeMs))
      bytes += file.size;
  }
  return bytes;
}

// Copy, check every file's size and SHA-256 against the original, then switch. A file already
// in the target with the same size and time is one an interrupted move copied, and is only
// checked. The old folder is never changed.
async function runMove(
  deps: FilesDeps,
  from: FilesLocation,
  target: string,
  pairs: readonly Pair[],
  update: (change: Partial<MoveProgress>) => void,
): Promise<string> {
  const listed = pairs.map((pair) => ({ pair, files: sourceFiles(pair) }));
  const totalFiles = listed.reduce((sum, item) => sum + item.files.length, 0);
  const totalBytes = listed.reduce(
    (sum, item) => sum + item.files.reduce((s, f) => s + f.size, 0),
    0,
  );
  update({ totalFiles, totalBytes });
  const copyOne = async (pair: Pair, file: SourceFile) => {
    const source = join(pair.from, file.path);
    const destination = join(pair.to, file.path);
    const partial = `${destination}.slopify-partial`;
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, partial);
    await utimes(partial, new Date(), new Date(file.mtimeMs));
    await rename(partial, destination);
  };
  for (const pair of pairs) await mkdir(pair.to, { recursive: true });
  let files = 0;
  let bytes = 0;
  for (const { pair, files: list } of listed)
    for (const file of list) {
      const there = await lstat(join(pair.to, file.path)).catch(() => undefined);
      if (!(there?.isFile() && there.size === file.size && there.mtimeMs === file.mtimeMs))
        await copyOne(pair, file);
      files += 1;
      bytes += file.size;
      update({ files, bytes });
    }
  update({ phase: "verifying", files: 0, bytes: 0 });
  files = 0;
  bytes = 0;
  for (const { pair, files: list } of listed)
    for (const file of list) {
      const source = join(pair.from, file.path);
      const destination = join(pair.to, file.path);
      if (!(await sameContent(source, destination))) {
        await copyOne(pair, file);
        if (!(await sameContent(source, destination)))
          throw new Error(
            `The copy of ${source} in ${destination} doesn't match the original, so Slopify kept using the old folder. Check the disk holding ${target} has no errors, then press Continue moving in Settings → Backup & storage.`,
          );
      }
      files += 1;
      bytes += file.size;
      update({ files, bytes });
    }
  // The last look and the switch happen in one go, so nothing can start writing in between.
  const busy = deps.busy();
  if (busy.length > 0)
    throw new Error(
      `A project started while your files were being copied, so Slopify kept using the old folder. Everything copied so far is kept: once ${busy[0]?.title === undefined ? "it" : `"${busy[0].title}"`} has finished, press Continue moving in Settings → Backup & storage.`,
    );
  for (const { pair, files: list } of listed) {
    const now = sourceFiles(pair);
    const before = new Map(list.map((file) => [file.path, file]));
    for (const file of now) {
      const was = before.get(file.path);
      if (was === undefined || was.size !== file.size || was.mtimeMs !== file.mtimeMs)
        throw new Error(
          `Files in ${pair.from} changed while they were being copied (${file.path}), so Slopify kept using the old folder. Press Continue moving in Settings → Backup & storage; it copies only what changed.`,
        );
    }
  }
  const to: FilesLocation = { kind: "root", root: target };
  writeSetting(deps.db, filesLocationKey, JSON.stringify(to));
  deps.db.prepare("DELETE FROM settings WHERE key=?").run(filesMoveKey);
  const old = from.kind === "root" ? from.root : deps.paths.projects;
  repoint(deps.paths, filesLayoutOf(to, deps.paths.dataDir));
  return old;
}

async function sameContent(a: string, b: string): Promise<boolean> {
  const [sa, sb] = await Promise.all([lstat(a), lstat(b).catch(() => undefined)]);
  if (sb === undefined || !sb.isFile() || sa.size !== sb.size) return false;
  const [ha, hb] = await Promise.all([sha256(a), sha256(b)]);
  return ha === hb;
}

async function sha256(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk as Buffer);
  return hash.digest("hex");
}

// ----- choosing a folder ------------------------------------------------------------------

const unixSystem = [
  "/bin",
  "/boot",
  "/dev",
  "/etc",
  "/lib",
  "/lib32",
  "/lib64",
  "/opt",
  "/proc",
  "/root",
  "/run",
  "/sbin",
  "/snap",
  "/srv",
  "/sys",
  "/usr",
  "/var",
  "/System",
  "/Library",
  "/Applications",
  "/private",
  "/cores",
];
const unixShared = ["/", "/home", "/Users", "/mnt", "/media", "/Volumes", "/tmp"];

// Why a folder can't hold Slopify's files, as the sentence Choose another folder shows;
// undefined when it can.
export async function targetProblem(
  deps: Pick<FilesDeps, "paths" | "platform" | "home">,
  from: FilesLocation,
  requested: string,
  resuming: boolean,
): Promise<string | undefined> {
  const platform = deps.platform ?? process.platform;
  if (requested === "" || !isAbsolute(requested))
    return `Enter the folder's full path, starting from the top of the disk (for example ${platform === "win32" ? "D:\\Slopify" : "/home/you/Videos/Slopify"}).`;
  if (/[\p{Cc}]/u.test(requested))
    return "The folder's name has a line break or another control character in it. Choose a folder whose name has none.";
  const target = resolve(requested);
  if (systemFolder(target, platform, deps.home))
    return `${target} is a system or shared folder. Choose a folder of your own, for example one inside your Documents or Videos folder.`;
  if (within(deps.paths.dataDir, target))
    return `${target} is inside Slopify's data folder (${deps.paths.dataDir}), which holds its database and settings. Choose a folder outside it.`;
  if (from.kind === "root" && samePath(from.root, target))
    return `Your files are already in ${target}.`;
  const next = filesLayoutOf({ kind: "root", root: target }, "");
  for (const [mine, theirs] of [
    [deps.paths.projects, next.projects],
    [deps.paths.projects, next.backups],
    [deps.paths.backups, next.projects],
    [deps.paths.backups, next.backups],
    [deps.paths.projects, target],
  ] as const)
    if (within(mine, theirs) || (theirs !== target && within(theirs, mine)))
      return `${target} overlaps the folder your files are in now (${mine}), so copying would copy the folder into itself. Choose a separate folder.`;
  if (!resuming)
    for (const folder of [next.projects, next.backups])
      if (!(await emptyOrMissing(folder).catch(() => false)))
        return `${folder} already has files in it. Slopify cleans up its Projects folder on its own, so it only moves into an empty one: choose another folder, or move those files away first.`;
  const existing = nearestExisting(target);
  const stat = await lstat(existing).catch(() => undefined);
  if (stat === undefined || !stat.isDirectory())
    return `${existing} is a file, not a folder, so ${target} can't be made there. Choose another folder.`;
  try {
    await access(existing, constants.W_OK);
  } catch {
    return `Slopify isn't allowed to write in ${existing}. Choose a folder your user can write to, or change that folder's permissions.`;
  }
  return undefined;
}

function systemFolder(path: string, platform: NodeJS.Platform, home: string | undefined): boolean {
  if (platform === "win32") {
    const p = path.replace(/[\\/]+$/, "").toLowerCase();
    if (
      parse(path)
        .root.replace(/[\\/]+$/, "")
        .toLowerCase() === p
    )
      return true;
    const env = process.env;
    return [env.SystemRoot, env.ProgramFiles, env["ProgramFiles(x86)"], env.ProgramData]
      .filter((dir): dir is string => dir !== undefined && dir !== "")
      .some((dir) => within(dir, path));
  }
  if (unixShared.includes(path) || (home !== undefined && samePath(home, path))) return true;
  return unixSystem.some((dir) => within(dir, path));
}

function nearestExisting(path: string): string {
  let current = resolve(path);
  for (;;) {
    if (lstatSync(current, { throwIfNoEntry: false }) !== undefined) return current;
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
}

async function freeBytesAt(path: string): Promise<number> {
  const stats = await statfs(path);
  return Number(stats.bavail) * Number(stats.bsize);
}

function busyDetail(projects: readonly BusyProject[]): string {
  const named = projects
    .slice(0, 3)
    .map((project) => `"${project.title}"`)
    .join(", ");
  const more = projects.length > 3 ? ` and ${projects.length - 3} more` : "";
  return `Slopify can't move your files while projects are being made (${named}${more}): their files are still being written. Wait for them to finish, or pause them on their project page, then press the button again.`;
}

function within(root: string, path: string): boolean {
  const r = relative(root, path);
  return r === "" || (r !== ".." && !r.startsWith(`..${sep}`) && !isAbsolute(r));
}

function samePath(a: string, b: string): boolean {
  return relative(resolve(a), resolve(b)) === "";
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes)) return "unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}
