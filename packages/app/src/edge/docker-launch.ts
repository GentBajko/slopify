#!/usr/bin/env node
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { nodeHostSetupRunner } from "../host-cli/install.js";
import { assertManagedDockerHost } from "./docker.js";
import { dockerEngine } from "./docker-projects/engine.js";
import { installProjects } from "./docker-projects/install.js";
import { dockerConfig, privateDirectory } from "./docker-projects/state.js";

async function main(): Promise<void> {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  assertManagedDockerHost(process.platform, uid, gid);
  if (gid === undefined)
    throw new Error(
      "Could not read your user's group. Run the --docker launcher as your normal logged-in user.",
    );
  const c = dockerConfig(process.env, homedir(), process.cwd(), uid, gid);
  await privateDirectory(c.root, uid);
  if (process.argv[2] !== "--locked") {
    const path = join(c.root, "setup.lock");
    const fd = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
    try {
      const s = await fd.stat();
      if (!s.isFile() || s.nlink !== 1 || s.uid !== uid || (s.mode & 0o077) !== 0)
        throw new Error(
          `The launcher's lock file ${path} has the wrong owner or permissions. Delete it and run the launcher again.`,
        );
      const child = spawn(
        "flock",
        [
          "--nonblock",
          "--no-fork",
          "--conflict-exit-code",
          "73",
          path,
          process.execPath,
          fileURLToPath(import.meta.url),
          "--locked",
        ],
        { stdio: "inherit" },
      );
      const code = await new Promise<number>((resolve, reject) => {
        child.once("error", () =>
          reject(
            new Error(
              "The --docker launcher needs the flock command, which isn't installed. Install util-linux (for example sudo apt install util-linux, or sudo pacman -S util-linux) and try again.",
            ),
          ),
        );
        child.once("exit", (status, signal) =>
          signal
            ? reject(
                new Error(
                  "Docker setup was interrupted before it finished. Run the same command again; Slopify will finish or undo the half-done step.",
                ),
              )
            : resolve(status ?? 1),
        );
      });
      if (code === 73)
        throw new Error(
          "Another Slopify --docker launcher is already running and changing your installation. Wait for it to finish, then run the command again.",
        );
      process.exitCode = code;
      return;
    } finally {
      await fd.close();
    }
  }
  const controller = new AbortController();
  const abort = () =>
    controller.abort(
      new Error(
        "Docker setup was stopped before it finished. Run the same command again; Slopify will finish or undo the half-done step.",
      ),
    );
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  try {
    const e = dockerEngine(nodeHostSetupRunner, controller.signal, process.env);
    const recovery = () =>
      dockerEngine(nodeHostSetupRunner, AbortSignal.timeout(5 * 60_000), process.env);
    const result = await installProjects(c, e, recovery);
    console.log(`Slopify is running at ${result.url}`);
    console.log(`Project files on this machine: ${result.projects}`);
    if (result.recovery)
      console.log(
        `Recovery volume retained: ${result.recovery}. Previous containers remain stopped.`,
      );
  } finally {
    process.off("SIGINT", abort);
    process.off("SIGTERM", abort);
  }
}
try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : "Docker setup failed.");
  process.exitCode = 1;
}
