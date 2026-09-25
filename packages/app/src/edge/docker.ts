import { mkdir, rmdir } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
import { type HostSetupRunner, installHostPackage } from "../host-cli/install.js";
import { ensureBridgeToken, hasCode, prepareHostPaths } from "../host-cli/paths.js";
import { ensureHostService, privateRead, privateWrite } from "../host-cli/service.js";
import { resolveHostCommand } from "../host-cli/status.js";
import { hostCliProtocol, hostLlmIds } from "../kernel/ports/host-cli.js";

export function assertManagedDockerHost(
  platform: string,
  uid: number | undefined,
  gid: number | undefined,
): asserts uid is number {
  if (platform !== "linux")
    throw new Error(
      "The managed Docker launcher requires Linux. Native Slopify and plain API-only Docker remain available on other hosts.",
    );
  if (uid === undefined || gid === undefined || uid === 0)
    throw new Error(
      "Run the managed Docker launcher as your logged-in user, not with sudo; grant that account access to Docker.",
    );
}

export interface DockerHostOptions {
  readonly root: string;
  readonly version: string;
  readonly image: string;
  readonly disabled: boolean;
  readonly accepted: boolean;
  readonly interactive: boolean;
  readonly prompt: (message: string) => Promise<boolean>;
  readonly runner: HostSetupRunner;
  readonly env: Readonly<NodeJS.ProcessEnv>;
  readonly signal: AbortSignal;
}
export async function prepareDockerHostCli(
  options: DockerHostOptions,
): Promise<{ directory?: string }> {
  if (options.disabled) return {};
  let installed = false;
  for (const id of hostLlmIds) {
    try {
      await resolveHostCommand(id, options.env);
      installed = true;
    } catch (error) {
      if (!hasCode(error, "ENOENT"))
        throw new Error("Host CLI detection failed. No container was changed.");
    }
  }
  if (!installed) return {};
  if (process.platform !== "linux")
    throw new Error(
      "Managed host CLI setup requires Linux/systemd. Use --host-cli=off for API-only Docker.",
    );
  const uid = process.getuid?.();
  if (uid === undefined || uid === 0)
    throw new Error(
      "Run the Docker launcher as your logged-in user, not root; or use --host-cli=off.",
    );
  const receiptPath = join(options.root, "consent.json");
  const existing = await privateRead(receiptPath, uid);
  const receipt = z.object({ version: z.literal(1), automaticStartup: z.literal(true) }).strict();
  let approved = options.accepted;
  if (existing !== undefined) {
    try {
      approved ||= receipt.safeParse(JSON.parse(existing)).success;
    } catch {
      throw new Error("Invalid host helper consent receipt.");
    }
  }
  if (!approved) {
    if (!options.interactive)
      throw new Error(
        "Host CLI setup needs confirmation. Use --accept-host-cli to approve, or --host-cli=off for API-only Docker.",
      );
    approved = await options.prompt(
      "Allow Slopify to run your host Claude Code, Codex and Gemini CLIs using their existing logins? This installs a private helper and enables automatic startup. User lingering keeps your user services running after logout and at boot. Credentials stay on the host. [y/N] ",
    );
    if (!approved)
      throw new Error(
        "Host CLI setup declined. The container is unchanged. Use --host-cli=off for API-only Docker.",
      );
  }
  const inspect = () =>
    options.runner.exec(
      "docker",
      [
        "image",
        "inspect",
        "--format",
        '{{index .Config.Labels "io.slopify.host-cli-protocol"}}',
        options.image,
      ],
      options.signal,
    );
  let image = await inspect();
  if (image.code !== 0 || image.stdout.trim() !== String(hostCliProtocol)) {
    const pulled = await options.runner.exec("docker", ["pull", options.image], options.signal);
    if (pulled.code !== 0)
      throw new Error(
        "Could not pull a compatible Docker image. No helper or container was changed.",
      );
    image = await inspect();
    if (image.code !== 0 || image.stdout.trim() !== String(hostCliProtocol))
      throw new Error(
        "This Docker image does not support the host helper. Update the image before retrying.",
      );
  }
  const supported = await options.runner.exec(
    "systemctl",
    ["--user", "list-units", "--no-legend", "--no-pager", "slopify-cli-bridge.service"],
    options.signal,
  );
  if (supported.code !== 0)
    throw new Error(
      "The systemd user service is unavailable. Use a normal Slopify install or --host-cli=off for API-only Docker.",
    );
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
          "Another host helper setup holds setup.lock. Wait for it to finish; the container is unchanged.",
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
    return { directory: paths.share };
  } finally {
    await rmdir(lock);
  }
}
