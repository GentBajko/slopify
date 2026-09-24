import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { isStableVersion, updatePackage } from "../updater/model.js";
import { installArgs, npmCommand } from "../updater/plan.js";
import { hasCode } from "./paths.js";

export interface HostSetupRunner {
  readonly exec: (
    file: string,
    args: readonly string[],
    signal: AbortSignal,
  ) => Promise<{ code: number; stdout: string }>;
}
export interface HostInstallOptions {
  readonly root: string;
  readonly version: string;
  readonly runner: HostSetupRunner;
  readonly signal: AbortSignal;
  readonly packageSource?: string;
}
export const nodeHostSetupRunner: HostSetupRunner = {
  exec: (file, args, signal) =>
    new Promise((resolve, reject) => {
      execFile(
        file,
        [...args],
        { signal, timeout: 15 * 60_000, maxBuffer: 1024 * 1024, windowsHide: true },
        (error, stdout) => {
          if (error && typeof error.code !== "number")
            return reject(
              new Error(
                "Host setup command could not finish. Check Docker, Node and the systemd user service.",
              ),
            );
          resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout });
        },
      );
    }),
};
async function entryAt(directory: string, version: string): Promise<string> {
  const path = join(directory, "node_modules", "@gentbajko", "slopify");
  z.object({ name: z.literal(updatePackage), version: z.literal(version) }).parse(
    JSON.parse(await readFile(join(path, "package.json"), "utf8")),
  );
  const entry = join(path, "dist/edge/host-cli.js");
  if (!(await lstat(entry)).isFile()) throw new Error("Host helper entry is not a regular file.");
  await access(entry);
  return entry;
}
export async function installHostPackage(options: HostInstallOptions): Promise<{ entry: string }> {
  const { root, version, runner, signal } = options;
  if (!isStableVersion(version)) throw new Error("Invalid host helper version.");
  const versions = join(root, "versions");
  const directory = join(versions, version);
  try {
    return { entry: await entryAt(directory, version) };
  } catch (error) {
    if (!hasCode(error, "ENOENT"))
      throw new Error("Existing host helper install is invalid. No service was changed.");
  }
  await mkdir(versions, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(versions, `.install-${version}-`));
  try {
    await writeFile(
      join(staging, ".npmrc"),
      "registry=https://registry.npmjs.org/\n@gentbajko:registry=https://registry.npmjs.org/\n",
      { mode: 0o600 },
    );
    await writeFile(join(staging, ".global-npmrc"), "", { mode: 0o600 });
    const npm = await npmCommand();
    const args = installArgs(staging, version);
    const result = await runner.exec(
      npm.file,
      [
        ...npm.args,
        ...args.slice(0, -1),
        "--ignore-scripts",
        options.packageSource ?? `${updatePackage}@${version}`,
      ],
      signal,
    );
    if (result.code !== 0)
      throw new Error(
        "npm could not install the host helper. The existing container was not changed.",
      );
    await entryAt(staging, version);
    await rename(staging, directory);
    return { entry: await entryAt(directory, version) };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
