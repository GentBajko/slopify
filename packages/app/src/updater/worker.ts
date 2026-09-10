import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { appendFile, copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runUpdateFlow } from "./install-flow.js";
import type { UpdatePlan } from "./plan.js";
import {
  activateUpdate,
  installArgs,
  installDirectory,
  installedEntry,
  restartArgs,
} from "./plan.js";
import { candidateReady } from "./readiness.js";

export async function performUpdate(plan: UpdatePlan, handoff: () => Promise<void>): Promise<void> {
  const directory = installDirectory(plan.dataDir, plan.version);
  const logs = join(plan.dataDir, "logs");
  await mkdir(logs, { recursive: true, mode: 0o700 });
  const logFile = join(logs, "updates.log");
  const database = join(plan.dataDir, "slopify.db");
  const backup = join(plan.dataDir, "updates", `before-${plan.version}-${Date.now()}.db`);
  let child: ChildProcess | undefined;
  const log = async (message: string) =>
    appendFile(logFile, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 });
  await runUpdateFlow(plan, {
    install: async () => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(
        join(directory, ".npmrc"),
        "registry=https://registry.npmjs.org/\n@gentbajko:registry=https://registry.npmjs.org/\n",
        { mode: 0o600 },
      );
      await writeFile(join(directory, ".global-npmrc"), "", { mode: 0o600 });
      await log(`Installing @gentbajko/slopify@${plan.version}.`);
      await installPackage(plan, directory);
      return installedEntry(plan.dataDir, plan.version);
    },
    handoff,
    backup: async () => {
      await copyFile(database, backup);
    },
    start: async (entry) => {
      const descriptor = openSync(logFile, "a", 0o600);
      try {
        child = spawn(process.execPath, restartArgs(entry, plan), {
          cwd: plan.cwd,
          detached: true,
          windowsHide: true,
          stdio: ["ignore", descriptor, descriptor],
          env: {
            ...process.env,
            SLOPIFY_SKIP_MANAGED_UPDATE: "1",
            SLOPIFY_UPDATE_TOKEN: plan.token,
            SLOPIFY_UPDATE_PENDING: entry === plan.oldEntry ? "0" : "1",
            SLOPIFY_UPDATE_FAILED: entry === plan.oldEntry ? "1" : "0",
          },
        });
        const started = child;
        await new Promise<void>((resolve, reject) => {
          started.once("spawn", resolve);
          started.once("error", reject);
        });
      } finally {
        closeSync(descriptor);
      }
    },
    healthy: async (version) => {
      await waitForServer(
        plan,
        version,
        () => child?.exitCode !== null || child?.signalCode !== null,
      );
      child?.unref();
    },
    stopCandidate: async () => {
      if (
        child === undefined ||
        child.pid === undefined ||
        child.exitCode !== null ||
        child.signalCode !== null
      )
        return;
      const running = child;
      await new Promise<void>((resolve, reject) => {
        const force = setTimeout(() => running.kill("SIGKILL"), 5000);
        const timeout = setTimeout(
          () => reject(new Error("The candidate server could not be stopped safely.")),
          10_000,
        );
        running.once("close", () => {
          clearTimeout(force);
          clearTimeout(timeout);
          resolve();
        });
        running.kill();
      });
    },
    restore: async () => {
      await rm(`${database}-wal`, { force: true });
      await rm(`${database}-shm`, { force: true });
      await copyFile(backup, database);
    },
    activate: async () => {
      if (child === undefined || child.exitCode !== null || child.signalCode !== null)
        throw new Error("The candidate stopped before activation.");
      await activateUpdate(plan.dataDir, plan.version, plan.token);
    },
    release: async () => {
      const response = await fetch(`${serverOrigin(plan)}/api/update/activate`, {
        method: "POST",
        headers: { "X-Slopify-Update-Token": plan.token },
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (!response.ok)
        throw new Error("The committed update could not acknowledge activation. Restart Slopify.");
    },
    report: (message) => {
      void log(message).catch(() => console.error("The update log could not be written."));
    },
  });
}

function installPackage(plan: UpdatePlan, directory: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      plan.npm.file,
      [...plan.npm.args, ...installArgs(directory, plan.version)],
      {
        cwd: directory,
        windowsHide: true,
        stdio: "ignore",
        timeout: 15 * 60_000,
        env: { ...process.env, npm_config_update_notifier: "false" },
      },
    );
    child.once("error", () => reject(new Error("npm could not be started.")));
    child.once("close", (code) =>
      code === 0 ? resolve() : reject(new Error("npm could not install the update.")),
    );
  });
}

async function waitForServer(
  plan: UpdatePlan,
  version: string,
  exited: () => boolean,
): Promise<void> {
  const until = Date.now() + 60_000;
  while (Date.now() < until) {
    if (exited()) throw new Error("Slopify stopped during startup.");
    try {
      if (await candidateReady(serverOrigin(plan), version, plan.token, exited, globalThis.fetch))
        return;
    } catch {
      /* The listener is not ready yet. */
    }
    await delay(250);
  }
  throw new Error("Slopify did not restart in time.");
}

function serverOrigin(plan: Pick<UpdatePlan, "host" | "port">): string {
  const host = plan.host === "0.0.0.0" ? "127.0.0.1" : plan.host === "::" ? "::1" : plan.host;
  return `http://${host.includes(":") ? `[${host}]` : host}:${plan.port}`;
}
