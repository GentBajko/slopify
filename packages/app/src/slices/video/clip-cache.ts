import { createHash } from "node:crypto";
import {
  constants,
  copyFileSync,
  linkSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
  utimesSync,
} from "node:fs";
import { dirname, join } from "node:path";

// The clips of a project's last render, kept so the next render encodes only the clips that
// changed. A clip is named by what went into its ffmpeg run: the binary, the arguments with
// its own output left out, every input file as it is on disk, and its chapter-card script and
// font. Any change to those is another name, so a clip is never reused for a picture it
// would not have drawn.
//
// The folder is one per project under a hidden folder of Projects, the same disk as the
// render's working folder so a clip is linked, not copied; storage reconcile and backups
// leave hidden folders alone, and deleting the project removes it.
const version = "clip-cache-v1";
const outputMark = "\u0000output";

// ceiling: the caches of every project together. A 2.5-hour video with transitions keeps
// about 10 GB of clips, so this holds the last few projects rendered.
const mostBytes = 30 * 1024 ** 3;
// floor: the free space a disk keeps before the caches give way; a tenth of a small disk.
const leastFree = 20 * 1024 ** 3;
const leastFreeShare = 0.1;

export function cacheKey(
  bin: string,
  args: readonly string[],
  output: string,
  extra: readonly string[] = [],
): string {
  const inputs: string[] = [];
  args.forEach((value, at) => {
    if (args[at - 1] === "-i") inputs.push(fileIdentity(value));
  });
  const named = args.map((value) => (value === output ? outputMark : value));
  return createHash("sha256")
    .update(JSON.stringify([version, bin, named, inputs, extra]))
    .digest("hex");
}

// A file as a key part: its path, size and last change. lavfi sources and other inputs that
// are not files are keyed by their text alone.
export function fileIdentity(path: string): string {
  const stat = statSync(path, { throwIfNoEntry: false });
  return stat === undefined ? path : `${path}|${String(stat.size)}|${String(stat.mtimeMs)}`;
}

// Puts the cached clip at `target`; false when there is none.
export function reuseClip(dir: string, key: string, target: string): boolean {
  const cached = join(dir, `${key}.mp4`);
  if (statSync(cached, { throwIfNoEntry: false })?.isFile() !== true) return false;
  place(cached, target);
  return true;
}

// Keeps a finished clip under its key, whole or not at all.
export function keepClip(dir: string, key: string, source: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const pending = join(dir, `${key}.${String(process.pid)}.part`);
  rmSync(pending, { force: true });
  place(source, pending);
  renameSync(pending, join(dir, `${key}.mp4`));
}

// After a finished render: the project keeps only that render's clips, and the other
// projects' caches give way, least recently rendered first, until all of them fit under the
// ceiling and the disk keeps its floor.
export function pruneClips(
  dir: string,
  used: ReadonlySet<string>,
  limits: { readonly mostBytes: number; readonly leastFree?: number } = { mostBytes },
): void {
  for (const name of list(dir)) {
    if (!used.has(name.replace(/\.mp4$/, ""))) rmSync(join(dir, name), { force: true });
  }
  const root = dirname(dir);
  const now = new Date();
  if (list(dir).length > 0) utimesSync(dir, now, now);
  const others = list(root)
    .map((name) => join(root, name))
    .filter((path) => path !== dir && statSync(path, { throwIfNoEntry: false })?.isDirectory())
    .map((path) => ({ path, at: statSync(path).mtimeMs, bytes: bytesOf(path) }))
    .toSorted((a, b) => a.at - b.at);
  const floor = limits.leastFree ?? Math.min(leastFree, diskBytes(root) * leastFreeShare);
  let total = bytesOf(dir) + others.reduce((sum, one) => sum + one.bytes, 0);
  for (const other of others) {
    if (total <= limits.mostBytes && freeBytes(root) >= floor) break;
    rmSync(other.path, { recursive: true, force: true });
    total -= other.bytes;
  }
  if (freeBytes(root) < floor) rmSync(dir, { recursive: true, force: true });
}

function place(from: string, to: string): void {
  try {
    linkSync(from, to);
  } catch {
    copyFileSync(from, to, constants.COPYFILE_FICLONE);
  }
}

function list(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function bytesOf(dir: string): number {
  return list(dir).reduce(
    (sum, name) => sum + (statSync(join(dir, name), { throwIfNoEntry: false })?.size ?? 0),
    0,
  );
}

function diskBytes(path: string): number {
  try {
    const stats = statfsSync(path);
    return stats.blocks * stats.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function freeBytes(path: string): number {
  try {
    const stats = statfsSync(path);
    return stats.bavail * stats.bsize;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
