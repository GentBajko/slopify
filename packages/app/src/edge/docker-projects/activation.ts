import { timingSafeEqual } from "node:crypto";
import { lstat, readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
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

export async function dockerFolderConfiguration(
  env: Readonly<NodeJS.ProcessEnv>,
  projectsRoot: string,
): Promise<{ container: boolean; hostProjects: string | null }> {
  if (env.SLOPIFY_CONTAINER !== "1") return { container: false, hostProjects: null };
  const host = env.SLOPIFY_DOCKER_PROJECTS_DIR;
  if (!host || env.SLOPIFY_DOCKER_INSTALL_STATE !== "/opt/slopify-install/activation.json")
    return { container: true, hostProjects: null };
  if (!isAbsolute(host) || resolve(host) !== host || /[\p{Cc},]/u.test(host))
    throw new Error("Invalid Docker host project path.");
  const root = await lstat(projectsRoot);
  const mounts = await readFile("/proc/self/mountinfo", "utf8");
  if (
    projectsRoot !== "/data/projects" ||
    !root.isDirectory() ||
    root.isSymbolicLink() ||
    !mounts.split("\n").some((line) => line.split(" ")[4] === "/data/projects")
  )
    throw new Error("Managed Docker project bind is missing.");
  return { container: true, hostProjects: host };
}
