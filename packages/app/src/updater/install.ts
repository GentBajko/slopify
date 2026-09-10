import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { UpdatePlan } from "./plan.js";
import { updatePlanSchema } from "./plan.js";

export async function launchUpdate(
  worker: string,
  plan: UpdatePlan,
  handoff: () => Promise<void>,
): Promise<void> {
  updatePlanSchema.parse(plan);
  const directory = join(plan.dataDir, "updates");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const planPath = join(directory, `plan-${randomUUID()}.json`);
  await writeFile(planPath, JSON.stringify(plan), { mode: 0o600 });
  const child = spawn(process.execPath, [worker, planPath], {
    cwd: plan.cwd,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });
  try {
    await new Promise<void>((resolve, reject) => {
      let restarting = false;
      const send = (type: "handoff" | "abort") => {
        if (!child.connected) {
          reject(new Error("The update worker disconnected."));
          return;
        }
        child.send({ type }, (error) => {
          if (error !== null) reject(new Error("The update handoff failed."));
        });
      };
      child.once("error", () => reject(new Error("The update worker could not start.")));
      child.once("exit", (code) =>
        code === 0 ? resolve() : reject(new Error("The update worker could not finish.")),
      );
      child.on("message", (message) => {
        if (typeof message !== "object" || message === null || !("type" in message)) return;
        if (message.type === "installed" && !restarting) {
          restarting = true;
          void handoff().then(
            () => send("handoff"),
            () => {
              send("abort");
              reject(new Error("Slopify could not release its server for the update."));
            },
          );
        }
      });
    });
  } finally {
    child.unref();
    await rm(planPath, { force: true });
  }
}
