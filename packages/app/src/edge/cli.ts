#!/usr/bin/env node
import { parseArgs } from "node:util";
import { configFrom } from "../kernel/config/index.js";
import { boot } from "../main.js";

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
  const { paths, stop } = await boot(config);
  console.log(`Slopify data directory: ${paths.dataDir}`);
  console.log(`Database: ${paths.db}`);
  console.log(`Logs: ${paths.logs}`);
  if (config.host !== "127.0.0.1") {
    console.warn(
      `WARNING: bound to ${config.host} - anyone who reaches this port controls the app and its keys (no login).`,
    );
  }
  // S2 replaces this with the HTTP server handle. Until something else holds the event
  // loop open the process would exit at once and drop the instance lock.
  const keepAlive = setInterval(() => {}, 1 << 30);
  process.on("SIGINT", () => {
    clearInterval(keepAlive);
    stop().then(
      () => process.exit(0),
      () => process.exit(1),
    );
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
