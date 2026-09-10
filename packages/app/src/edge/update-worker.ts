import { readFile, rm } from "node:fs/promises";
import { updatePlanSchema } from "../updater/plan.js";
import { performUpdate } from "../updater/worker.js";

const planPath = process.argv[2];
try {
  if (planPath === undefined || !process.connected)
    throw new Error("An update plan and parent process are required.");
  const plan = updatePlanSchema.parse(JSON.parse(await readFile(planPath, "utf8")));
  await rm(planPath, { force: true });
  await performUpdate(
    plan,
    () =>
      new Promise<void>((resolve, reject) => {
        if (!process.connected) {
          reject(new Error("The update parent disconnected."));
          return;
        }
        const fail = () => {
          clearTimeout(timer);
          reject(new Error("The update parent disconnected."));
        };
        const timer = setTimeout(() => reject(new Error("The update handoff timed out.")), 60_000);
        process.once("disconnect", fail);
        process.once("message", (message) => {
          clearTimeout(timer);
          process.off("disconnect", fail);
          if (
            typeof message === "object" &&
            message !== null &&
            "type" in message &&
            message.type === "handoff"
          )
            resolve();
          else reject(new Error("The update handoff was refused."));
        });
        process.send?.({ type: "installed" }, (error: Error | null) => {
          if (error !== null) fail();
        });
      }),
  );
  if (process.connected) process.disconnect?.();
} catch {
  if (process.connected) process.disconnect?.();
  process.exitCode = 1;
}
