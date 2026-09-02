#!/usr/bin/env node
import { parseArgs } from "node:util";
import { configFrom } from "../kernel/config/index.js";
import { boot } from "../main.js";
import { openBrowser } from "./open-browser.js";

const { values } = parseArgs({
  options: {
    port: { type: "string" },
    host: { type: "string" },
    "data-dir": { type: "string" },
    "no-open": { type: "boolean" },
  },
});

try {
  const config = configFrom(values, process.env);
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
  process.on("SIGINT", () => {
    stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
