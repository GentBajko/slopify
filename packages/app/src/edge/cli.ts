#!/usr/bin/env node
import { spawnSync } from "node:child_process";
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
    "no-open": { type: "boolean" },
    docker: { type: "boolean" },
  },
});

try {
  if (values.docker) {
    if (values.host !== undefined || values["data-dir"] !== undefined)
      throw new Error(
        "Docker stores data in the slopify-data volume and binds to localhost. Use --port to change its port.",
      );
    const result = spawnSync(
      "bash",
      [fileURLToPath(new URL("../../scripts/docker-run.sh", import.meta.url))],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          ...(values.port === undefined ? {} : { SLOPIFY_DOCKER_HOST_PORT: values.port }),
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
  const { paths, url, stop } = await boot(config);
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
