import { lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { privateRead, privateWrite } from "../../host-cli/service.js";
import { isMissing, syncDirectory } from "./tree.js";

export const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
export const absolute = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => isAbsolute(p) && resolve(p) === p && !/[\p{Cc},]/u.test(p));
const identity = z.object({ dev: z.string(), ino: z.string() }).strict();
const digest = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
const token = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * install.json: what the Docker install command last committed. The compose file and its .env
 * are rendered from it, the host helper reads `projects` and `projectsIdentity` to decide which
 * folders it may open, and the next install or update starts from it.
 */
export const installSchema = z
  .object({
    version: z.literal(2),
    name: identifier,
    volume: identifier,
    daemon: z.string(),
    image: z.string().min(1),
    appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
    user: z.string().regex(/^\d+:\d+$/),
    port: z.number().int().min(0).max(65535),
    projects: absolute,
    projectsIdentity: identity,
    hostCli: z.boolean(),
    token,
    recovery: z.string().nullable(),
  })
  .strict();
export type Install = z.infer<typeof installSchema>;

/**
 * update.json exists only while an install or update is changing things. If a run is cut off,
 * the next run finds it and puts the previous version back before doing anything else.
 */
export const updateSchema = z
  .object({
    version: z.literal(2),
    id: z.string().uuid(),
    phase: z.enum(["stopping", "snapshot", "starting"]),
    // The image being installed; its fixed volume helper does the snapshot and the restore.
    image: z.string().min(1),
    previous: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("none") }).strict(),
      z.object({ kind: z.literal("compose"), env: z.string(), activation: z.string() }).strict(),
      z
        .object({
          kind: z.literal("legacy"),
          id: z.string(),
          name: identifier,
          renamed: identifier,
          running: z.boolean(),
          restart: z.string(),
        })
        .strict(),
    ]),
    backup: z.string().nullable(),
    backupDigest: digest.nullable(),
    // A project folder this run filled with a verified copy; the undo removes it again.
    published: z.object({ path: absolute, identity }).strict().nullable(),
  })
  .strict();
export type Update = z.infer<typeof updateSchema>;

// 2.5.0's launcher records, read only to adopt an installation it made.
export const legacyReceiptSchema = z
  .object({ name: identifier, volume: identifier, projects: absolute, directoryIdentity: identity })
  .passthrough();
export const legacyJournalSchema = z
  .object({
    id: z.string(),
    name: identifier,
    volume: identifier,
    phase: z.string(),
    backup: z.string(),
  })
  .passthrough();
export const settledLegacyPhases = new Set(["healthy", "committed", "restored", "rolled-back"]);

/** Where the Docker install command keeps one folder per installation. */
export function dockerRoot(env: Readonly<NodeJS.ProcessEnv>, home: string): string {
  return join(absolute.parse(env.XDG_DATA_HOME || join(home, ".local/share")), "slopify/docker");
}

export async function privateDirectory(path: string, uid: number): Promise<void> {
  absolute.parse(path);
  let current: string = sep;
  for (const name of path.split(sep).filter(Boolean)) {
    current = join(current, name);
    await mkdir(current, { mode: 0o700 }).catch((error: unknown) => {
      if (
        !(typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST")
      )
        throw error;
    });
    const s = await lstat(current);
    if (
      !s.isDirectory() ||
      s.isSymbolicLink() ||
      ((s.mode & 0o022) !== 0 && (s.mode & 0o1000) === 0)
    )
      throw new Error(
        `${current} is not a normal folder, or other users can write to it, so Slopify won't keep its Docker settings under it. Fix its permissions (chmod go-w ${current}) or set XDG_DATA_HOME to another folder, then try again.`,
      );
  }
  const s = await lstat(path);
  if (s.uid !== uid || (s.mode & 0o077) !== 0)
    throw new Error(
      `${path} must belong to you and be private. Fix it with chmod 700 ${path} (and chown it to your user if needed), then try again.`,
    );
}

export async function readState<T>(
  path: string,
  schema: z.ZodType<T>,
  uid: number,
): Promise<T | null> {
  const s = await lstat(path).catch((error: unknown) => {
    if (isMissing(error)) return undefined;
    throw error;
  });
  if (s === undefined) return null;
  if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || s.uid !== uid || (s.mode & 0o077) !== 0)
    throw new Error(
      `${path} is not a private file owned by you, so Slopify won't trust it. Fix it (chmod 600 ${path}) and try again.`,
    );
  const text = await privateRead(path, uid);
  if (text === undefined)
    throw new Error(`${path} changed while Slopify was reading it. Try again.`);
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new Error(
      `${path} is damaged, so Slopify can't tell what is installed. Move it aside and run the install command again.`,
    );
  }
}

export async function writeState(path: string, value: unknown): Promise<void> {
  await writeText(path, JSON.stringify(value));
}

export async function writeText(path: string, text: string): Promise<void> {
  if (Buffer.byteLength(text) > 64 * 1024)
    throw new Error("Installation control record exceeds 64 KiB.");
  await privateWrite(path, text);
  await syncDirectory(dirname(path));
}
