import { randomBytes } from "node:crypto";
import { constants } from "node:fs";
import { chmod, lstat, mkdir, open } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";

export interface HostPaths {
  readonly root: string;
  readonly share: string;
  readonly socket: string;
  readonly tokenFile: string;
}
export async function prepareHostPaths(root: string): Promise<HostPaths> {
  if (!isAbsolute(root) || /[\p{Cc}]/u.test(root))
    throw new Error(
      `Unsafe host helper directory ${JSON.stringify(root)}: it must be a full path. Check XDG_DATA_HOME and HOME, then run the launcher again.`,
    );
  const normalized = resolve(root);
  const share = join(normalized, "share");
  const socket = join(share, "cli.sock");
  if (Buffer.byteLength(socket) > 100)
    throw new Error(
      `The host helper path ${socket} is too long for this system (over 100 bytes). Set a shorter XDG_DATA_HOME, for example XDG_DATA_HOME=~/.local/share, and run the launcher again.`,
    );
  await mkdir(normalized, { recursive: true, mode: 0o700 });
  await ownedDirectory(normalized, true);
  await chmod(normalized, 0o700);
  await mkdir(share, { recursive: true, mode: 0o755 });
  await ownedDirectory(share);
  await chmod(share, 0o755);
  return { root: normalized, share, socket, tokenFile: join(share, "token") };
}
async function ownedDirectory(path: string, privateRoot = false): Promise<void> {
  const entry = await lstat(path);
  if (
    !entry.isDirectory() ||
    entry.isSymbolicLink() ||
    (privateRoot && (entry.mode & 0o077) !== 0) ||
    (process.getuid && entry.uid !== process.getuid())
  )
    throw new Error(
      `Unsafe host helper directory ${path}: it must be a real folder owned by you${privateRoot ? " that only you can read" : ""}. Fix its owner and permissions (chmod ${privateRoot ? "700" : "755"} ${path}) or delete it, then run the launcher again.`,
    );
}
export async function readBridgeToken(path: string): Promise<string> {
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const entry = await file.stat();
    if (!entry.isFile() || entry.size !== 64 || (entry.mode & 0o022) !== 0)
      throw new Error(
        `The host helper token file ${path} is damaged. Delete it and run the launcher again.`,
      );
    const buffer = Buffer.alloc(65);
    const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
    const value = buffer.subarray(0, bytesRead).toString("utf8");
    if (!/^[a-f0-9]{64}$/.test(value))
      throw new Error(
        `The host helper token file ${path} is damaged. Delete it and run the launcher again.`,
      );
    return value;
  } finally {
    await file.close();
  }
}
export async function ensureBridgeToken(path: string): Promise<string> {
  try {
    const file = await open(path, "wx", 0o644);
    try {
      await file.writeFile(randomBytes(32).toString("hex"));
      await file.chmod(0o644);
    } finally {
      await file.close();
    }
  } catch (error) {
    if (!hasCode(error, "EEXIST")) throw error;
  }
  const entry = await lstat(path);
  if (entry.isSymbolicLink() || (process.getuid && entry.uid !== process.getuid()))
    throw new Error(
      `The host helper token file ${path} is a link or belongs to another user. Delete it and run the launcher again.`,
    );
  return readBridgeToken(path);
}
export function hasCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}
