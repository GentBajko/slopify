import { timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { FilesLayout } from "../../kernel/paths.js";
import { backupsFolderName } from "../../slices/storage/layout.js";
import { readState } from "./state.js";

const activationSchema = z
  .object({
    version: z.literal(1),
    token: z.string().regex(/^[a-f0-9]{64}$/),
    committed: z.boolean(),
  })
  .strict();

export async function dockerActivationCommitted(path: string, token: string): Promise<boolean> {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const marker = await readState(path, activationSchema, process.getuid?.() ?? -1);
  return (
    marker?.committed === true && timingSafeEqual(Buffer.from(marker.token), Buffer.from(token))
  );
}

// Where a container keeps the user-visible files. The installer decides them on the host (the
// Projects bind, and from 3.0 a Backups bind beside it), so they are never stored in settings.
export function dockerFilesLayout(env: Readonly<NodeJS.ProcessEnv>, dataDir: string): FilesLayout {
  const projects = join(dataDir, "projects");
  return {
    projects,
    backups: env.SLOPIFY_DOCKER_BACKUPS_DIR
      ? join(dataDir, "backups")
      : join(projects, backupsFolderName),
    exports: null,
  };
}

export async function dockerFolderConfiguration(
  env: Readonly<NodeJS.ProcessEnv>,
  projectsRoot: string,
): Promise<{ container: boolean; hostProjects: string | null; hostBackups: string | null }> {
  if (env.SLOPIFY_CONTAINER !== "1")
    return { container: false, hostProjects: null, hostBackups: null };
  const host = env.SLOPIFY_DOCKER_PROJECTS_DIR;
  if (!host || env.SLOPIFY_DOCKER_INSTALL_STATE !== "/opt/slopify-install/activation.json")
    return { container: true, hostProjects: null, hostBackups: null };
  const backups = env.SLOPIFY_DOCKER_BACKUPS_DIR || null;
  for (const path of [host, backups])
    if (path !== null && (!isAbsolute(path) || resolve(path) !== path || /[\p{Cc},]/u.test(path)))
      throw new Error("Invalid Docker host project path.");
  const root = await lstat(projectsRoot);
  const mounts = (await readFile("/proc/self/mountinfo", "utf8"))
    .split("\n")
    .map((line) => line.split(" ")[4]);
  if (
    projectsRoot !== "/data/projects" ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    !mounts.includes("/data/projects")
  )
    throw new Error("Managed Docker project bind is missing.");
  return {
    container: true,
    hostProjects: host,
    hostBackups: backups !== null && mounts.includes("/data/backups") ? backups : null,
  };
}
