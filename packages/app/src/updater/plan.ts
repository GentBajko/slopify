import { constants } from "node:fs";
import { access, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import { z } from "zod";
import type { CliCommand } from "../kernel/cli-command.js";
import { cliCommand } from "../kernel/cli-command.js";
import {
  isStableVersion,
  isUpdateToken,
  newerVersion,
  npmRegistry,
  updatePackage,
} from "./model.js";

export const updatePlanSchema = z.object({
  token: z.string().refine(isUpdateToken),
  version: z.string().refine(isStableVersion),
  previousVersion: z.string().refine(isStableVersion),
  oldEntry: z.string().min(1),
  dataDir: z.string().min(1),
  cwd: z.string().min(1),
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  npm: z.object({ file: z.string().min(1), args: z.array(z.string()) }),
});
export type UpdatePlan = z.infer<typeof updatePlanSchema>;

export function installDirectory(dataDir: string, version: string): string {
  if (!isStableVersion(version)) throw new Error("Invalid update version.");
  return join(dataDir, "updates", version);
}

export function installArgs(directory: string, version: string): readonly string[] {
  if (!isStableVersion(version)) throw new Error("Invalid update version.");
  return [
    "install",
    "--prefix",
    directory,
    "--registry",
    npmRegistry,
    `--@gentbajko:registry=${npmRegistry}`,
    "--no-audit",
    "--no-fund",
    "--omit=dev",
    "--save-exact",
    "--global=false",
    "--workspaces=false",
    "--userconfig",
    join(directory, ".npmrc"),
    "--globalconfig",
    join(directory, ".global-npmrc"),
    "--cache",
    join(dirname(directory), "npm-cache"),
    `${updatePackage}@${version}`,
  ];
}

export function restartArgs(
  entry: string,
  plan: Pick<UpdatePlan, "host" | "port" | "dataDir">,
): readonly string[] {
  // The existing page reconnects itself; opening a second browser tab on an update is unnecessary.
  return [
    entry,
    "--host",
    plan.host,
    "--port",
    String(plan.port),
    "--data-dir",
    plan.dataDir,
    "--no-open",
  ];
}

export async function installedEntry(dataDir: string, version: string): Promise<string> {
  const directory = join(
    installDirectory(dataDir, version),
    "node_modules",
    "@gentbajko",
    "slopify",
  );
  const metadata = z
    .object({ name: z.literal(updatePackage), version: z.literal(version) })
    .parse(JSON.parse(await readFile(join(directory, "package.json"), "utf8")));
  if (metadata.version !== version) throw new Error("Installed update version differs.");
  const entry = join(directory, "dist", "edge", "cli.js");
  await access(entry, constants.R_OK);
  return entry;
}

export async function activeUpdateEntry(
  dataDir: string,
  currentVersion: string,
): Promise<string | undefined> {
  try {
    const content = await readFile(join(dataDir, "updates", "current.json"), "utf8");
    const { version } = z
      .object({ version: z.string().refine(isStableVersion) })
      .parse(JSON.parse(content));
    return newerVersion(version, currentVersion)
      ? await installedEntry(dataDir, version)
      : undefined;
  } catch {
    // A missing, partial or no-longer-installed pointer must not prevent the original CLI starting.
    return undefined;
  }
}

export async function activateUpdate(
  dataDir: string,
  version: string,
  token: string,
): Promise<void> {
  if (!isUpdateToken(token)) throw new Error("Invalid update token.");
  await installedEntry(dataDir, version);
  const pointer = join(dataDir, "updates", "current.json");
  const temporary = `${pointer}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ version, token }), { mode: 0o600 });
  await rename(temporary, pointer);
}

export async function npmCommand(): Promise<CliCommand> {
  const nodeDir = dirname(process.execPath);
  for (const candidate of [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ]) {
    try {
      await access(candidate, constants.R_OK);
      return { file: process.execPath, args: [await realpath(candidate)] };
    } catch {
      /* Try the next standard Node installation layout. */
    }
  }
  if (process.platform === "win32") return cliCommand("npm.cmd");
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory === "") continue;
    const candidate = join(directory, "npm");
    try {
      await access(candidate, constants.X_OK);
      return { file: await realpath(candidate), args: [] };
    } catch {
      /* PATH can include directories without npm. */
    }
  }
  throw new Error("npm is unavailable. Install Node.js with npm to use in-app updates.");
}

export async function updateCommitted(
  dataDir: string,
  version: string,
  token: string,
): Promise<boolean> {
  try {
    const pointer = z.object({ version: z.literal(version), token: z.literal(token) });
    return pointer.safeParse(
      JSON.parse(await readFile(join(dataDir, "updates", "current.json"), "utf8")),
    ).success;
  } catch {
    // Before activation the marker is absent or belongs to the previous release.
    return false;
  }
}
