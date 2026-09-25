import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { nodeRunCli } from "../adapters/llm/run-cli.js";
import { hostEnvironmentSchema } from "../host-cli/environment.js";
import { launchXdgOpen } from "../host-cli/open-folder.js";
import { ensureBridgeToken, prepareHostPaths } from "../host-cli/paths.js";
import { createHostRuntime } from "../host-cli/runtime.js";
import { startHostServer } from "../host-cli/server.js";
import { resolveHostCommand } from "../host-cli/status.js";
import { readVersion } from "../kernel/version.js";
import { nodeCliProbe } from "../slices/settings/cli-status.js";
import { dockerRoot } from "./docker-projects/state.js";

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
  const buffer = Buffer.alloc(64 * 1024 + 1);
  const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
  if (bytesRead > 64 * 1024) throw new Error("Host environment file is too large.");
  const environment = hostEnvironmentSchema.parse(
    JSON.parse(buffer.subarray(0, bytesRead).toString("utf8")),
  );
  Object.assign(process.env, environment);
} finally {
  await file.close();
}
// Without a usable data folder there are no launcher receipts, so Open folder stays unsupported.
let folderRoot: string | undefined;
try {
  folderRoot = dockerRoot(process.env, process.env.HOME || homedir());
} catch {
  folderRoot = undefined;
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
    ...(process.getuid === undefined || folderRoot === undefined
      ? {}
      : { folders: { root: folderRoot, uid: process.getuid(), launch: launchXdgOpen } }),
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
