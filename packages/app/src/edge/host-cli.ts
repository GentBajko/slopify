import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { z } from "zod";
import { nodeRunCli } from "../adapters/llm/run-cli.js";
import { ensureBridgeToken, prepareHostPaths } from "../host-cli/paths.js";
import { createHostRuntime } from "../host-cli/runtime.js";
import { startHostServer } from "../host-cli/server.js";
import { resolveHostCommand } from "../host-cli/status.js";
import { readVersion } from "../kernel/version.js";
import { nodeCliProbe } from "../slices/settings/cli-status.js";

const { values } = parseArgs({ options: { "state-dir": { type: "string" } }, strict: true });
if (!values["state-dir"]) throw new Error("A host helper state directory is required.");
const paths = await prepareHostPaths(values["state-dir"]);
const file = await open(
  join(paths.root, "host-environment.json"),
  constants.O_RDONLY | constants.O_NOFOLLOW,
);
try {
  const stat = await file.stat();
  if (
    !stat.isFile() ||
    stat.size > 64 * 1024 ||
    (stat.mode & 0o077) !== 0 ||
    (process.getuid && stat.uid !== process.getuid())
  )
    throw new Error("Unsafe host environment file.");
  const path = z
    .string()
    .max(16384)
    .refine((value) => !/[\p{Cc}]/u.test(value));
  const environment = z
    .object({
      HOME: path,
      PATH: path,
      CODEX_HOME: path.optional(),
      CLAUDE_CONFIG_DIR: path.optional(),
      XDG_CONFIG_HOME: path.optional(),
      XDG_DATA_HOME: path.optional(),
      XDG_CACHE_HOME: path.optional(),
      SSL_CERT_FILE: path.optional(),
      NODE_EXTRA_CA_CERTS: path.optional(),
    })
    .strict()
    .parse(JSON.parse(await file.readFile("utf8")));
  Object.assign(process.env, environment);
} finally {
  await file.close();
}
const server = await startHostServer({
  directory: paths.share,
  token: await ensureBridgeToken(paths.tokenFile),
  version: readVersion(),
  ports: createHostRuntime({
    run: nodeRunCli,
    probe: nodeCliProbe,
    env: process.env,
    now: Date.now,
    resolve: (id) => resolveHostCommand(id, process.env),
  }),
});
process.on("SIGHUP", server.pauseAdmissions);
process.on("SIGUSR2", server.resumeAdmissions);
const stop = () => {
  void server.stop().then(
    () => {
      process.exitCode = 0;
    },
    () => {
      console.error("Host helper shutdown failed.");
      process.exitCode = 1;
    },
  );
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
