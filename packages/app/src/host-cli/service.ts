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
        throw new Error("Unsafe host helper configuration.");
      const buffer = Buffer.alloc(64 * 1024 + 1);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 64 * 1024) throw new Error("Host configuration too large.");
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
  throw new Error("Host helper did not become ready within 30 seconds.");
}
export async function ensureHostService(options: HostServiceOptions): Promise<void> {
  const { root, env, runner, signal, uid } = options;
  const environment = JSON.stringify(hostEnvironment(env));
  const directory = join(env.XDG_CONFIG_HOME ?? join(env.HOME ?? "", ".config"), "systemd/user");
  if (!isAbsolute(directory)) throw new Error("Host configuration directory must be absolute.");
  const unitPath = join(directory, hostUnit);
  const configPath = join(root, "host-environment.json");
  const previous = await privateRead(unitPath, uid);
  const previousConfig = await privateRead(configPath, uid);
  if (previous !== undefined && !previous.startsWith(`${marker}\n`))
    throw new Error("An existing host helper service is not owned by Slopify. It was not changed.");
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
        `Host helper setup failed (${file}). The existing container was not changed.`,
      );
    return result;
  };
  const fragment = (
    await run("systemctl", ["--user", "show", hostUnit, "--property=FragmentPath", "--value"])
  ).stdout.trim();
  if (fragment && fragment !== unitPath)
    throw new Error("An existing host helper service is not owned by this Slopify installation.");
  const active =
    (await run("systemctl", ["--user", "is-active", "--quiet", hostUnit], false)).code === 0;
  const wasEnabled =
    (await run("systemctl", ["--user", "is-enabled", "--quiet", hostUnit], false)).code === 0;
  const current = await helperHealth(root, signal);
  if (active && (!previous || !current))
    throw new Error(
      "The running host helper cannot be verified. Check its service before updating; no work was interrupted.",
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
        throw new Error("The host helper is doing work. Wait for it to finish before updating.");
    }
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const directoryStat = await lstat(directory);
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || directoryStat.uid !== uid)
      throw new Error("Unsafe user service directory.");
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
        "Host helper setup failed and rollback needs attention. Check slopify-cli-bridge.service; the Docker container was not changed.",
      );
    }
    throw error;
  }
}
