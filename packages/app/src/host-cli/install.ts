import { execFile } from "node:child_process";
import { access, lstat, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { isStableVersion, updatePackage } from "../updater/model.js";
import { installArgs, npmCommand } from "../updater/plan.js";
import { hasCode } from "./paths.js";

export interface HostSetupRunner {
  readonly exec: (
    file: string,
    args: readonly string[],
    signal: AbortSignal,
  ) => Promise<{ code: number; stdout: string; stderr?: string }>;
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
        (error, stdout, stderr) => {
          if (error && typeof error.code !== "number")
            return reject(new Error(setupCommandFailure(file, args, error)));
          resolve({ code: typeof error?.code === "number" ? error.code : 0, stdout, stderr });
        },
      );
    }),
};
// Says which program could not run and what to do about it; Node's own error only names the
// errno, and the person running the launcher needs the fix.
function setupCommandFailure(
  file: string,
  args: readonly string[],
  error: Error & { code?: unknown; killed?: boolean },
): string {
  const name = basename(file);
  const step = `"${[name, ...args.slice(0, 2)].join(" ")}"`;
  if (error.code === "ENOENT") {
    if (name === "docker")
      return "Docker is not installed, or the docker command is not on your PATH. Install Docker Engine (https://docs.docker.com/engine/install/), check that docker info works, and run the launcher again.";
    if (name === "systemctl" || name === "loginctl")
      return `${name} was not found. Using this machine's AI CLIs from Docker needs systemd; start with --host-cli=off to use API keys only.`;
    if (name === "npm" || name === "npm.cmd")
      return "npm was not found. Install Node.js with npm (https://nodejs.org) and run the launcher again.";
    return `${name} was not found on your PATH. Install it and run the launcher again.`;
  }
  if (error.code === "EACCES")
    return `${file} could not be run (permission denied). Check that your user may run it, then try again.`;
  if (error.code === "ABORT_ERR" || error.name === "AbortError")
    return `${step} was stopped before it finished. Run the launcher again; Slopify will finish or undo the half-done step.`;
  if (error.killed)
    return `${step} took too long and was stopped. Check your internet connection and that Docker is running (docker info), then run the launcher again.`;
  return `${step} could not finish (${error.message}). Check that Docker, Node.js and systemd user services work on this machine, then run the launcher again.`;
}
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
      throw new Error(
        `The installed host helper in ${directory} is damaged. Delete that folder and run the launcher again. Nothing else was changed.`,
      );
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
        "npm could not install the Slopify host helper. Check your internet connection (npm must reach registry.npmjs.org) and run the launcher again. Your existing container was not changed.",
      );
    await entryAt(staging, version);
    await rename(staging, directory);
    return { entry: await entryAt(directory, version) };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
