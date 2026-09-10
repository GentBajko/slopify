import { spawn } from "node:child_process";
import { activeUpdateEntry } from "./plan.js";

export async function forwardManagedUpdate(
  dataDir: string,
  version: string,
  args: readonly string[],
): Promise<number | undefined> {
  if (process.env.SLOPIFY_SKIP_MANAGED_UPDATE === "1") return undefined;
  const entry = await activeUpdateEntry(dataDir, version);
  if (entry === undefined) return undefined;
  return new Promise<number | undefined>((resolve) => {
    const child = spawn(process.execPath, [entry, ...args], {
      stdio: "inherit",
      windowsHide: true,
    });
    const interrupt = () => {
      child.kill("SIGINT");
    };
    const terminate = () => {
      child.kill("SIGTERM");
    };
    process.once("SIGINT", interrupt);
    process.once("SIGTERM", terminate);
    const cleanup = () => {
      process.off("SIGINT", interrupt);
      process.off("SIGTERM", terminate);
    };
    child.once("error", () => {
      cleanup();
      resolve(undefined);
    });
    child.once("close", (code) => {
      cleanup();
      resolve(code ?? 1);
    });
  });
}
