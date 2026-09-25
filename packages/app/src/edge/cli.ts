#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { configFrom } from "../kernel/config/index.js";
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

try {
  if (values["projects-dir"] !== undefined && !values.docker)
    throw new Error("--projects-dir requires --docker; native installs use --data-dir.");
  if (
    (values["host-cli"] !== undefined || values["accept-host-cli"] !== undefined) &&
    !values.docker
  )
    throw new Error("Host CLI options require --docker.");
  if (values["host-cli"] !== undefined && values["host-cli"] !== "off")
    throw new Error("The --host-cli override supports only off (API-only Docker).");
  if (values.docker) {
    if (values.host !== undefined || values["data-dir"] !== undefined)
      throw new Error(
        "Docker keeps private data in its named volume and binds to localhost. Use --projects-dir for project files and --port for the port.",
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
    if (result.error) throw result.error;
    process.exit(result.status ?? 1);
  }
  const config = configFrom(values, process.env);
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
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
