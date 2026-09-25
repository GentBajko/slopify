import { constants } from "node:fs";
import { lstat, mkdir, open, rename, unlink } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { hostRequest, readHostBytes } from "../adapters/host-cli/transport.js";
import { bridgeLimits, hostHealthSchema } from "../kernel/ports/host-cli.js";
import { hostEnvironment } from "./environment.js";
import type { HostSetupRunner } from "./install.js";
import { hasCode } from "./paths.js";

const marker = "# Managed by Slopify host CLI bridge, protocol 1";
export const hostUnit = "slopify-cli-bridge.service";
export interface HostServiceOptions {
  readonly root: string;
  readonly entry: string;
  readonly node: string;
  readonly uid: number;
  readonly version: string;
  readonly runner: HostSetupRunner;
  readonly signal: AbortSignal;
  readonly env: Readonly<NodeJS.ProcessEnv>;
}
function unitArg(value: string): string {
  if (!isAbsolute(value) || /[\p{Cc}]/u.test(value)) throw new Error("Invalid service path.");
  return JSON.stringify(value.replaceAll("%", "%%"));
}
export function serviceUnit(node: string, entry: string, root: string): string {
  return [
    marker,
    "[Unit]",
    "Description=Slopify host CLI bridge",
    "",
    "[Service]",
    "Type=simple",
    `ExecStart=:${unitArg(node)} ${unitArg(entry)} --state-dir ${unitArg(root)}`,
    "Restart=on-failure",
    "RestartSec=2",
    "KillMode=control-group",
    "TimeoutStopSec=5",
    "UMask=0077",
    "",
    "[Install]",
    "WantedBy=default.target",
    "",
  ].join("\n");
}
export async function privateRead(path: string, uid: number): Promise<string | undefined> {
  try {
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stat = await file.stat();
      if (!stat.isFile() || stat.uid !== uid || stat.size > 64 * 1024 || (stat.mode & 0o022) !== 0)
        throw new Error(
          `${path} must be a regular file owned by you that others can't write to. Fix it (chmod 600 ${path}) or delete it, then run the launcher again.`,
        );
      const buffer = Buffer.alloc(64 * 1024 + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 64 * 1024)
        throw new Error(
          `${path} is too large to be a Slopify file. Delete it and run the launcher again.`,
        );
      return buffer.subarray(0, bytesRead).toString("utf8");
    } finally {
      await file.close();
    }
  } catch (error) {
    if (hasCode(error, "ENOENT")) return undefined;
    throw error;
  }
}
export async function privateWrite(path: string, text: string): Promise<void> {
  const temporary = `${path}.${process.pid}.tmp`;
  const file = await open(temporary, "wx", 0o600);
  try {
    await file.writeFile(text);
    await file.sync();
  } finally {
    await file.close();
  }
  try {
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch((error) => {
      if (!hasCode(error, "ENOENT")) throw error;
    });
  }
}
export async function helperHealth(
  root: string,
  signal: AbortSignal,
): Promise<import("zod").infer<typeof hostHealthSchema> | undefined> {
  try {
    const response = await hostRequest({
      directory: join(root, "share"),
      path: "/v1/health",
      method: "GET",
      kind: "metadata",
      signal: AbortSignal.any([signal, AbortSignal.timeout(1000)]),
    });
    if (response.statusCode !== 200) {
      response.destroy();
      return undefined;
    }
    return hostHealthSchema.parse(
      JSON.parse((await readHostBytes(response, bridgeLimits.status)).toString("utf8")),
    );
  } catch {
    return undefined;
  }
}
async function waitHealth(
  options: HostServiceOptions,
  accepting: boolean,
): Promise<NonNullable<Awaited<ReturnType<typeof helperHealth>>>> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    options.signal.throwIfAborted();
    const health = await helperHealth(options.root, options.signal);
    if (
      health &&
      health.accepting === accepting &&
      (!accepting || health.version === options.version)
    )
      return health;
    await delay(100, undefined, { signal: options.signal });
  }
  throw new Error(
    `The Slopify host helper did not start within 30 seconds. See why with: systemctl --user status ${hostUnit}`,
  );
}
export async function ensureHostService(options: HostServiceOptions): Promise<void> {
  const { root, env, runner, signal, uid } = options;
  const environment = JSON.stringify(hostEnvironment(env));
  const directory = join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? "", ".config"), "systemd/user");
  if (!isAbsolute(directory))
    throw new Error(
      "Could not find your systemd user folder because HOME (or XDG_CONFIG_HOME) is not a full path. Set it and run the launcher again.",
    );
  const unitPath = join(directory, hostUnit);
  const configPath = join(root, "host-environment.json");
  const previous = await privateRead(unitPath, uid);
  const previousConfig = await privateRead(configPath, uid);
  if (previous !== undefined && !previous.startsWith(`${marker}\n`))
    throw new Error(
      `A service file ${unitPath} already exists and is not owned by Slopify, so it was left alone. Rename or remove it, or start with --host-cli=off to use API keys only.`,
    );
  const unit = serviceUnit(options.node, options.entry, root);
  const run = async (
    file: string,
    args: readonly string[],
    required = true,
    commandSignal = signal,
  ) => {
    const result = await runner.exec(file, args, commandSignal);
    if (required && result.code !== 0)
      throw new Error(
        `Host helper setup failed at "${[file, ...args.slice(0, 2)].join(" ")}"${result.stderr?.trim() ? ` (${result.stderr.trim().split("\n").at(-1)?.slice(0, 300)})` : ""}. Check that systemd user services work (systemctl --user status), or start with --host-cli=off to use API keys only. Your existing container was not changed.`,
      );
    return result;
  };
  const fragment = (
    await run("systemctl", ["--user", "show", hostUnit, "--property=FragmentPath", "--value"])
  ).stdout.trim();
  if (fragment && fragment !== unitPath)
    throw new Error(
      `A ${hostUnit} service from somewhere else (${fragment}) is already installed and is not owned by this Slopify, so it was left alone. Remove it, or start with --host-cli=off to use API keys only.`,
    );
  const active =
    (await run("systemctl", ["--user", "is-active", "--quiet", hostUnit], false)).code === 0;
  const wasEnabled =
    (await run("systemctl", ["--user", "is-enabled", "--quiet", hostUnit], false)).code === 0;
  const current = await helperHealth(root, signal);
  if (active && (!previous || !current))
    throw new Error(
      `The Slopify host helper is running but not answering, so it was not replaced. Restart it (systemctl --user restart ${hostUnit}) and run the launcher again; no work was interrupted.`,
    );
  const linger = (
    await run("loginctl", ["show-user", String(uid), "-p", "Linger", "--value"])
  ).stdout.trim();
  if (linger !== "yes") await run("loginctl", ["enable-linger", String(uid)]);
  if (
    current?.version === options.version &&
    current.accepting &&
    previous === unit &&
    previousConfig === environment
  ) {
    await run("systemctl", ["--user", "enable", hostUnit]);
    return;
  }
  let paused = false;
  let replaced = false;
  try {
    if (active) {
      paused = true;
      await run("systemctl", ["--user", "kill", "--kill-whom=main", "--signal=SIGHUP", hostUnit]);
      if ((await waitHealth(options, false)).active !== 0)
        throw new Error(
          "The host helper is doing work for Slopify right now. Wait for running projects to finish, then run the launcher again.",
        );
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== uid)
      throw new Error(
        `${directory} is not a normal folder owned by your user, so Slopify can't add its service there. Fix its owner and run the launcher again.`,
      );
    replaced = true;
    await privateWrite(configPath, environment);
    await privateWrite(unitPath, unit);
    await run("systemctl", ["--user", "daemon-reload"]);
    await run("systemctl", ["--user", "enable", hostUnit]);
    await run("systemctl", ["--user", active ? "restart" : "start", hostUnit]);
    await waitHealth(options, true);
    paused = false;
  } catch (error) {
    const rollbackSignal = AbortSignal.timeout(35_000);
    const restore = (args: readonly string[]) => run("systemctl", args, true, rollbackSignal);
    try {
      if (replaced) {
        await restore(["--user", "stop", hostUnit]);
        if (!wasEnabled) await restore(["--user", "disable", hostUnit]);
        if (previous === undefined) await unlink(unitPath);
        else await privateWrite(unitPath, previous);
        if (previousConfig === undefined) await unlink(configPath);
        else await privateWrite(configPath, previousConfig);
        await restore(["--user", "daemon-reload"]);
        if (active) {
          await restore(["--user", "start", hostUnit]);
          await waitHealth(
            { ...options, signal: rollbackSignal, version: current?.version ?? options.version },
            true,
          );
        }
      } else if (paused)
        await restore(["--user", "kill", "--kill-whom=main", "--signal=SIGUSR2", hostUnit]);
    } catch {
      throw new Error(
        `Host helper setup failed and Slopify could not fully undo it. Check the service with systemctl --user status ${hostUnit}; your Docker container was not changed.`,
      );
    }
    throw error;
  }
}
