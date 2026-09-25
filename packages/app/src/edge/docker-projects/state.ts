import { lstat, mkdir, readdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { z } from "zod";
import { privateRead, privateWrite } from "../../host-cli/service.js";
import {
  assertIdentity,
  contains,
  isMissing,
  safePath,
  syncDirectory,
  treeDigest,
} from "./tree.js";

const identifier = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/);
const absolute = z
  .string()
  .min(1)
  .max(4096)
  .refine((p) => isAbsolute(p) && resolve(p) === p && !/[\p{Cc},]/u.test(p));
export const identitySchema = z.object({ dev: z.string(), ino: z.string() }).strict();
export const digestSchema = z
  .object({
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    files: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative(),
  })
  .strict();
export const containerSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    image: z.string(),
    user: z.string(),
    running: z.boolean(),
    restart: z.object({ Name: z.string(), MaximumRetryCount: z.number().int() }),
    signature: z.string().nullable(),
    installation: z.string().nullable(),
    mounts: z.array(
      z.object({
        type: z.string(),
        name: z.string(),
        source: z.string(),
        destination: z.string(),
        rw: z.boolean(),
      }),
    ),
    port: z.string().nullable(),
  })
  .strict();
export type Container = z.infer<typeof containerSchema>;
export const receiptSchema = z
  .object({
    version: z.literal(1),
    installation: z.string().uuid(),
    daemon: z.string(),
    name: identifier,
    volume: identifier,
    volumeIdentity: z.string(),
    projects: absolute,
    directoryIdentity: identitySchema,
    user: z.string(),
    image: z.string(),
    signature: z.string(),
    transaction: z.string().uuid(),
  })
  .strict();
export type Receipt = z.infer<typeof receiptSchema>;
export const phases = [
  "prepared",
  "stopping",
  "stopped",
  "snapshot",
  "copying",
  "verified",
  "published",
  "starting",
  "healthy",
  "committed",
  "restored",
  "rolled-back",
] as const;
export const journalSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    installation: z.string().uuid(),
    daemon: z.string(),
    name: identifier,
    volume: identifier,
    volumeIdentity: z.string().nullable(),
    image: z.string(),
    user: z.string(),
    signature: z.string(),
    phase: z.enum(phases),
    previous: containerSchema.nullable(),
    previousReceipt: receiptSchema.nullable(),
    sourceBind: absolute.nullable(),
    destination: absolute,
    destinationBefore: identitySchema.nullable(),
    staging: absolute,
    stagingIdentity: identitySchema.nullable(),
    publishedIdentity: identitySchema.nullable(),
    sourceDigest: digestSchema.nullable(),
    sourceAbsent: z.boolean().default(false),
    backup: identifier,
    backupDigest: digestSchema.nullable(),
    candidate: z.string().nullable(),
    token: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Journal = z.infer<typeof journalSchema>;
export interface DockerConfig {
  readonly home: string;
  readonly uid: number;
  readonly gid: number;
  readonly root: string;
  readonly directory: string;
  readonly name: string;
  readonly volume: string;
  readonly image: string;
  readonly port: number;
  readonly projectsOverride: string | null;
  readonly bridge: string | null;
}
export function dockerConfig(
  env: Readonly<NodeJS.ProcessEnv>,
  home: string,
  cwd: string,
  uid: number,
  gid: number,
): DockerConfig {
  const name = identifier.parse(env.SLOPIFY_DOCKER_NAME || "slopify");
  const volume = identifier.parse(env.SLOPIFY_DOCKER_VOLUME || "slopify-data");
  const root = join(
    absolute.parse(env.XDG_DATA_HOME || join(home, ".local/share")),
    "slopify/docker",
  );
  const raw = env.SLOPIFY_DOCKER_PROJECTS_DIR || null;
  const projectsOverride =
    raw === null ? null : resolve(cwd, raw.startsWith("~/") ? join(home, raw.slice(2)) : raw);
  const portText = env.SLOPIFY_DOCKER_HOST_PORT || "6969";
  if (!/^\d{1,5}$/.test(portText) || Number(portText) > 65535)
    throw new Error("Docker host port must be from 0 to 65535.");
  return {
    home,
    uid,
    gid,
    root,
    directory: join(root, name),
    name,
    volume,
    image: z
      .string()
      .min(1)
      .refine((s) => !/[\p{Cc}]/u.test(s))
      .parse(env.SLOPIFY_DOCKER_IMAGE || "ghcr.io/gentbajko/slopify:latest"),
    port: Number(portText),
    projectsOverride,
    bridge: env.SLOPIFY_HOST_CLI_DIR || null,
  };
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
      throw new Error("Unsafe private state ancestor.");
  }
  const s = await lstat(path);
  if (s.uid !== uid || (s.mode & 0o077) !== 0)
    throw new Error("Installation state must be private and owned by the installing user.");
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
    throw new Error("Unsafe private installation record.");
  const text = await privateRead(path, uid);
  if (text === undefined) throw new Error("Installation record changed while reading.");
  return schema.parse(JSON.parse(text));
}
export async function writeState(path: string, value: unknown): Promise<void> {
  const text = JSON.stringify(value);
  if (Buffer.byteLength(text) > 64 * 1024)
    throw new Error("Installation control record exceeds 64 KiB.");
  await privateWrite(path, text);
  await syncDirectory(dirname(path));
}
export async function selectProjects(
  c: DockerConfig,
  receipt: Receipt | null,
  old: Container | null,
  retry: Journal | null = null,
): Promise<string> {
  const data = old?.mounts.find((m) => m.destination === "/data");
  const bind = old?.mounts.find((m) => m.destination === "/data/projects");
  if (old && (data?.type !== "volume" || data.name !== c.volume))
    throw new Error("Existing container uses a different data volume.");
  if (bind && (bind.type !== "bind" || !bind.rw))
    throw new Error("Unsupported existing projects mount.");
  if (
    old?.mounts.some(
      (m) => m.destination.startsWith("/data/") && m.destination !== "/data/projects",
    )
  )
    throw new Error("Unexpected nested data mount; use the existing installation for recovery.");
  if (receipt) {
    if (receipt.name !== c.name || receipt.volume !== c.volume)
      throw new Error("Receipt selects a different installation or volume.");
    await safePath(receipt.projects, c.home, c.root, false);
    await assertIdentity(receipt.projects, receipt.directoryIdentity).catch((cause: unknown) => {
      throw new Error(`Remembered project folder is missing or replaced: ${receipt.projects}`, {
        cause,
      });
    });
    if (old && (bind?.source !== receipt.projects || old.installation !== receipt.installation))
      throw new Error("Actual container mounts/installation disagree with its receipt.");
  }
  const chosen =
    c.projectsOverride ??
    receipt?.projects ??
    bind?.source ??
    (c.name === "slopify"
      ? join(c.home, "Slopify/Projects")
      : join(c.home, "Slopify", c.name, "Projects"));
  await safePath(chosen, c.home, c.root, true);
  const source = receipt?.projects ?? bind?.source;
  if (source && source !== chosen && (contains(source, chosen) || contains(chosen, source)))
    throw new Error("Source and destination project folders cannot contain each other.");
  if (chosen !== source) {
    const entries = await readdir(chosen).catch((error: unknown) => {
      if (isMissing(error)) return [];
      throw error;
    });
    if (entries.length > 0) {
      if (retry?.destination !== chosen || !retry.publishedIdentity || !retry.sourceDigest)
        throw new Error(`Unrelated populated destination: ${chosen}`);
      await assertIdentity(chosen, retry.publishedIdentity);
      if ((await treeDigest(chosen)).hash !== retry.sourceDigest.hash)
        throw new Error(`Published retry destination changed: ${chosen}`);
    }
  }
  return chosen;
}
