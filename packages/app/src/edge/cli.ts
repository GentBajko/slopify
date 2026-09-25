#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { type Config, configFrom } from "../kernel/config/index.js";
import { readVersion } from "../kernel/version.js";
import { boot } from "../main.js";
import { forwardManagedUpdate } from "../updater/forward.js";
import { openBrowser } from "./open-browser.js";
import { installSignalShutdown } from "./signal-shutdown.js";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string" },
    "data-dir": { type: "string" },
    "projects-dir": { type: "string" },
    "no-open": { type: "boolean" },
    docker: { type: "boolean" },
    "host-cli": { type: "string" },
    "accept-host-cli": { type: "boolean" },
  },
});

let config: Config | undefined;
try {
  if (values["projects-dir"] !== undefined && !values.docker)
    throw new Error(
      "--projects-dir only works together with --docker. Without Docker, choose where Slopify keeps its files with --data-dir <folder>.",
    );
  if (
    (values["host-cli"] !== undefined || values["accept-host-cli"] !== undefined) &&
    !values.docker
  )
    throw new Error(
      "--host-cli and --accept-host-cli only work together with --docker. Add --docker, or remove those options.",
    );
  if (values["host-cli"] !== undefined && values["host-cli"] !== "off")
    throw new Error(
      `--host-cli=${values["host-cli"]} is not supported. The only value is --host-cli=off, which starts Docker using API keys only; leave the option out to use the AI CLIs installed on this machine.`,
    );
  if (values.docker) {
    if (values.host !== undefined || values["data-dir"] !== undefined)
      throw new Error(
        "--host and --data-dir can't be used with --docker: the Docker version always listens on localhost and keeps its data in a Docker volume. Use --projects-dir <folder> for project files and --port <number> for the port.",
      );
    const docker: typeof import("./docker.js") = await import("./docker.js");
    docker.assertManagedDockerHost(process.platform, process.getuid?.(), process.getgid?.());
    const { prepareDockerHostCli } = docker;
    const { nodeHostSetupRunner } = await import("../host-cli/install.js");
    const bridge = await prepareDockerHostCli({
      root: join(process.env.XDG_DATA_HOME ?? join(homedir(), ".local/share"), "slopify/host-cli"),
      version: readVersion(),
      image: process.env.SLOPIFY_DOCKER_IMAGE ?? "ghcr.io/gentbajko/slopify:latest",
      disabled: values["host-cli"] === "off",
      accepted: values["accept-host-cli"] === true,
      interactive: process.stdin.isTTY === true,
      env: process.env,
      signal: AbortSignal.timeout(20 * 60_000),
      runner: nodeHostSetupRunner,
      prompt: async (message) => {
        const terminal = createInterface({ input: process.stdin, output: process.stdout });
        try {
          return /^(?:y|yes)$/i.test((await terminal.question(message)).trim());
        } finally {
          terminal.close();
        }
      },
    });
    console.log(
      bridge.directory
        ? "Host CLI helper ready. Existing CLI logins stay on the host."
        : "Starting API-only Docker. Rerun the launcher after installing host CLIs to enable them.",
    );
    const result = spawnSync(
      "bash",
      [fileURLToPath(new URL("../../scripts/docker-run.sh", import.meta.url))],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          SLOPIFY_HOST_CLI_DIR: bridge.directory ?? "",
          ...(values.port === undefined ? {} : { SLOPIFY_DOCKER_HOST_PORT: values.port }),
          ...(values["projects-dir"] === undefined
            ? {}
            : { SLOPIFY_DOCKER_PROJECTS_DIR: values["projects-dir"] }),
        },
      },
    );
    if (result.error)
      throw new Error(
        `Could not start the Docker launcher script (${result.error.message}). Make sure bash is installed and on your PATH, then try again.`,
      );
    process.exit(result.status ?? 1);
  }
  config = configFrom(values, process.env);
  const forwarded = await forwardManagedUpdate(
    config.dataDir,
    readVersion(),
    process.argv.slice(2),
  );
  if (forwarded !== undefined) process.exit(forwarded);
  const { paths, url, stop } = await boot(config, {
    prefetchSubtitleModel: ["", "0", "false"].includes(
      (process.env.SLOPIFY_NO_MODEL_PREFETCH ?? "").trim().toLowerCase(),
    ),
    subtitleModelSeed: process.env.SLOPIFY_SUBTITLE_MODEL_SEED?.trim() || undefined,
  });
  console.log(`Slopify is running at ${url}`);
  console.log(`Slopify data directory: ${paths.dataDir}`);
  console.log(`Database: ${paths.db}`);
  console.log(`Logs: ${paths.logs}`);
  if (config.host !== "127.0.0.1") {
    console.warn(
      `WARNING: bound to ${config.host} - anyone who reaches this port controls the app and its keys (no login).`,
    );
  }
  if (config.open) {
    openBrowser(url, (message) => {
      console.warn(message);
    });
  }
  installSignalShutdown({
    on: (signal, listener) => process.on(signal, listener),
    stop,
    exit: (code) => process.exit(code),
  });
} catch (error) {
  console.error(explainStartupError(error, config));
  process.exit(1);
}

// Node's own wording for a failed listen or file operation ("listen EADDRINUSE: address already
// in use") names the symptom but not the fix, so the common startup failures are restated here.
function explainStartupError(error: unknown, config: Config | undefined): string {
  if (!(error instanceof Error)) return String(error);
  const code = "code" in error && typeof error.code === "string" ? error.code : undefined;
  const syscall = "syscall" in error && typeof error.syscall === "string" ? error.syscall : "";
  if (config !== undefined && syscall === "listen") {
    const other = config.port === 7070 ? 7071 : 7070;
    if (code === "EADDRINUSE")
      return `Port ${config.port} is already in use by another program (maybe another Slopify). Stop that program, or start Slopify on another port: npx @gentbajko/slopify --port ${other}`;
    if (code === "EACCES" || code === "EPERM")
      return `Slopify is not allowed to use port ${config.port}${config.port < 1024 ? " (ports below 1024 need administrator rights)" : ""}. Start it on another port: npx @gentbajko/slopify --port ${other}`;
    if (code === "EADDRNOTAVAIL" || code === "ENOTFOUND" || code === "EAI_AGAIN")
      return `Slopify can't listen on ${config.host} because that address doesn't belong to this machine. Leave out --host (and SLOPIFY_HOST) to use 127.0.0.1, or use an address this machine owns.`;
  }
  const path = "path" in error && typeof error.path === "string" ? error.path : undefined;
  if (
    config !== undefined &&
    path?.startsWith(config.dataDir) &&
    (code === "EACCES" || code === "EPERM" || code === "EROFS")
  )
    return `Slopify can't write to its data folder ${config.dataDir} (${error.message}). Make sure your user owns that folder and can write to it, or choose another one: npx @gentbajko/slopify --data-dir <folder>`;
  if (code === "ENOSPC")
    return `The disk is full (${error.message}). Free up some space and start Slopify again.`;
  return error.message;
}
