import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";
import type { BackupFile } from "./model.js";

// Only files whose whole name matches these are this feature's. Pruning and the leftover sweep
// touch nothing else in the folder: not an Export everything download
// (slopify-backup-2026-09-27.tar), not a file the user renamed, not a symlink.
const finalPattern = /^slopify-backup-(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})(\d{2})Z\.tar$/;
const partialPattern = /^\.slopify-backup-\d{4}-\d{2}-\d{2}T\d{6}Z\.tar\.partial$/;

export function backupFileName(at: Date): string {
  const iso = at.toISOString();
  return `slopify-backup-${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}${iso.slice(17, 19)}Z.tar`;
}

export function isBackupFileName(name: string): boolean {
  return finalPattern.test(name);
}

function createdAtOf(name: string): string | null {
  const match = finalPattern.exec(name);
  if (match === null) return null;
  const [, y, mo, d, h, mi, s] = match;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}.000Z`;
}

function partialName(name: string): string {
  return `.${name}.partial`;
}

export async function ensureFolder(folder: string): Promise<void> {
  await mkdir(folder, { recursive: true, mode: 0o700 });
  const stat = await lstat(folder);
  if (!stat.isDirectory()) throw Object.assign(new Error("not a folder"), { code: "ENOTDIR" });
}

// Writes the archive under a hidden temporary name and renames it into place only after every
// byte is on disk, so a crash, a full disk or a stop never leaves a file that looks like a
// finished backup, and pruning never counts one.
export async function writeAtomically(
  folder: string,
  name: string,
  chunks: AsyncIterable<Uint8Array>,
  signal?: AbortSignal,
): Promise<{ readonly path: string; readonly bytes: number }> {
  if (!isBackupFileName(name)) throw new Error(`${name} is not a backup file name.`);
  const target = join(folder, name);
  if ((await lstat(target).catch(() => undefined)) !== undefined)
    throw Object.assign(new Error(`${name} already exists.`), { code: "EEXIST" });
  const temporary = join(folder, partialName(name));
  const handle = await open(
    temporary,
    constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW ?? 0),
    0o600,
  );
  let bytes = 0;
  let renamed = false;
  try {
    for await (const chunk of chunks) {
      signal?.throwIfAborted();
      let written = 0;
      while (written < chunk.byteLength) {
        const result = await handle.write(chunk, written, chunk.byteLength - written);
        written += result.bytesWritten;
      }
      bytes += chunk.byteLength;
      // One turn of the event loop per chunk, so requests keep being answered while a large
      // archive is written.
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
    signal?.throwIfAborted();
    await handle.sync();
    await handle.close();
    await rename(temporary, target);
    renamed = true;
    await syncFolder(folder);
    return { path: target, bytes };
  } finally {
    if (!renamed) {
      await handle.close().catch(() => undefined);
      await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}

async function syncFolder(folder: string): Promise<void> {
  try {
    const handle = await open(folder, constants.O_RDONLY);
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Some filesystems refuse fsync on a directory; the rename itself already happened.
  }
}

// This feature's finished backups in the folder, oldest first. The time in the name orders
// them, not the file's mtime, which a copy or a restore can change.
export async function listBackups(folder: string): Promise<BackupFile[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch (error) {
    if (codeOf(error) === "ENOENT") return [];
    throw error;
  }
  const out: BackupFile[] = [];
  for (const name of names.filter(isBackupFileName).toSorted()) {
    const stat = await lstat(join(folder, name)).catch(() => undefined);
    const createdAt = createdAtOf(name);
    if (stat?.isFile() !== true || createdAt === null) continue;
    out.push({ name, bytes: stat.size, createdAt });
  }
  return out;
}

// Deletes this feature's oldest backups until `keep` remain. Nothing else is ever removed.
export async function pruneBackups(folder: string, keep: number): Promise<string[]> {
  const files = await listBackups(folder);
  const doomed = files.slice(0, Math.max(0, files.length - Math.max(1, keep)));
  for (const file of doomed) await rm(join(folder, file.name));
  return doomed.map((file) => file.name);
}

// A partial file left by a crash or a power cut. Only called while no backup is being written.
export async function removeLeftovers(folder: string): Promise<number> {
  let removed = 0;
  for (const name of await readdir(folder)) {
    if (!partialPattern.test(name)) continue;
    const stat = await lstat(join(folder, name)).catch(() => undefined);
    if (stat?.isFile() !== true) continue;
    await rm(join(folder, name));
    removed += 1;
  }
  return removed;
}

export function codeOf(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}
