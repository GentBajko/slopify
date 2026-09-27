import { mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { type HostSetupRunner, installHostPackage } from "../host-cli/install.js";
import { ensureBridgeToken, hasCode, prepareHostPaths } from "../host-cli/paths.js";
import { ensureHostService, privateRead, privateWrite } from "../host-cli/service.js";
import { hostCommandName, resolveHostCommand } from "../host-cli/status.js";
import { hostLlmIds } from "../kernel/ports/host-cli.js";

export function assertManagedDockerHost(
  platform: string,
  uid: number | undefined,
  gid: number | undefined,
): asserts uid is number {
  if (platform !== "linux")
    throw new Error(
      "The --docker install only works on Linux. On this system, run Slopify without Docker (npx @gentbajko/slopify), or run the compose.yaml from the Slopify repository yourself (docker compose up -d).",
    );
  if (uid === undefined || gid === undefined || uid === 0)
    throw new Error(
      "Don't run the --docker launcher with sudo or as root. Run it as your normal user, and if Docker then says permission denied, give your user access: sudo usermod -aG docker $USER, then log out and back in.",
    );
}

export interface DockerHostOptions {
  readonly root: string;
  readonly version: string;
  readonly disabled: boolean;
  readonly accepted: boolean;
  readonly interactive: boolean;
  readonly prompt: (message: string) => Promise<boolean>;
  readonly runner: HostSetupRunner;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly signal: AbortSignal;
}
export type DockerHostCli =
  | { readonly enabled: false }
  | { readonly enabled: true; readonly ensure: () => Promise<string> };

/**
 * Decides whether the Docker installation uses this machine's AI CLIs, asking once for consent,
 * before anything changes. `ensure` then installs or updates the bridge: a private helper, run as
 * the systemd user service slopify-cli-bridge.service, at the same version as the image.
 */
export async function planDockerHostCli(options: DockerHostOptions): Promise<DockerHostCli> {
  if (options.disabled) return { enabled: false };
  let installed = false;
  for (const id of hostLlmIds) {
    try {
      await resolveHostCommand(id, options.env);
      installed = true;
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw new Error(
          `Could not check whether ${hostCommandName(id)} is installed on this machine (${error instanceof Error ? error.message : String(error)}). Nothing was changed. Fix the problem, or start with --host-cli=off to use API keys only.`,
        );
    }
  }
  if (!installed) return { enabled: false };
  if (process.platform !== "linux")
    throw new Error(
      "Using this machine's AI CLIs from Docker needs Linux with systemd. Start with --host-cli=off to use API keys only.",
    );
  const uid = process.getuid?.();
  if (uid === undefined || uid === 0)
    throw new Error(
      "Don't run the --docker launcher with sudo or as root; run it as your normal user. Or start with --host-cli=off to use API keys only.",
    );
  const receiptPath = join(options.root, "consent.json");
  const existing = await privateRead(receiptPath, uid);
  const receipt = z.object({ version: z.literal(1), automaticStartup: z.literal(true) }).strict();
  let approved = options.accepted;
  if (existing !== undefined) {
    try {
      approved ||= receipt.safeParse(JSON.parse(existing)).success;
    } catch {
      throw new Error(
        `The saved answer to the host CLI question (${receiptPath}) is damaged. Delete that file and run the launcher again to be asked again.`,
      );
    }
  }
  if (!approved) {
    if (!options.interactive)
      throw new Error(
        "Slopify needs your OK to use the Claude Code, Codex or Gemini CLI installed on this machine, but can't ask because this isn't an interactive terminal. Rerun with --accept-host-cli to allow it, or with --host-cli=off to use API keys only.",
      );
    approved = await options.prompt(
      "Allow Slopify to run your host Claude Code, Codex and Gemini CLIs using their existing logins? This installs a private helper and enables automatic startup. User lingering keeps your user services running after logout and at boot. Credentials stay on the host. [y/N] ",
    );
    if (!approved)
      throw new Error(
        "You declined, so Slopify did not set up your host AI CLIs and nothing was changed. Run the launcher again and answer y to allow it, or add --host-cli=off to start with API keys only.",
      );
  }
  const supported = await options.runner.exec(
    "systemctl",
    ["--user", "list-units", "--no-legend", "--no-pager", "slopify-cli-bridge.service"],
    options.signal,
  );
  if (supported.code !== 0)
    throw new Error(
      "Using this machine's AI CLIs from Docker needs systemd user services (systemctl --user), which aren't available here. Start with --host-cli=off to use API keys only, or run Slopify without Docker: npx @gentbajko/slopify.",
    );
  return { enabled: true, ensure: () => ensureDockerHostCli(options, uid, receiptPath) };
}

async function ensureDockerHostCli(
  options: DockerHostOptions,
  uid: number,
  receiptPath: string,
): Promise<string> {
  const paths = await prepareHostPaths(options.root);
  const lock = join(paths.root, "setup.lock");
  const deadline = Date.now() + 30_000;
  for (;;) {
    try {
      await mkdir(lock, { mode: 0o700 });
      break;
    } catch (error) {
      if (!hasCode(error, "EEXIST")) throw error;
      if (Date.now() >= deadline)
        throw new Error(
          `Another Slopify launcher is setting up the host CLI helper right now. Wait for it to finish and try again. If no other launcher is running, delete the folder ${lock} and retry.`,
        );
      await delay(100, undefined, { signal: options.signal });
    }
  }
  try {
    await ensureBridgeToken(paths.tokenFile);
    const installed = await installHostPackage({
      root: paths.root,
      version: options.version,
      runner: options.runner,
      signal: options.signal,
    });
    await ensureHostService({
      root: paths.root,
      entry: installed.entry,
      node: process.execPath,
      uid,
      version: options.version,
      runner: options.runner,
      signal: options.signal,
      env: options.env,
    });
    await privateWrite(receiptPath, JSON.stringify({ version: 1, automaticStartup: true }));
    return paths.share;
  } finally {
    await rmdir(lock);
  }
}
