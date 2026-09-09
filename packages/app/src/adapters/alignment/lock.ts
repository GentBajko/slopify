import { open, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";

// Models run one at a time per data directory, including requests from separate app
// processes. A canceled waiter never removes another request's lock.
export async function claimWorker(
  cacheDir: string,
  signal: AbortSignal,
): Promise<() => Promise<void>> {
  const path = join(cacheDir, "alignment-worker.lock");
  for (;;) {
    signal.throwIfAborted();
    try {
      const file = await open(path, "wx", 0o600);
      try {
        try {
          await file.writeFile(String(process.pid));
        } finally {
          await file.close();
        }
      } catch (error) {
        await rm(path, { force: true });
        throw error;
      }
      return async () => {
        await rm(path, { force: true });
      };
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    }
    try {
      const owner = Number(await readFile(path, "utf8"));
      if (
        (!Number.isInteger(owner) || owner <= 0) &&
        Date.now() - (await stat(path)).mtimeMs > 10_000
      ) {
        await rm(path, { force: true });
        continue;
      }
      if (Number.isInteger(owner) && owner > 0) {
        try {
          process.kill(owner, 0);
        } catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ESRCH") {
            await rm(path, { force: true });
            continue;
          }
          throw error;
        }
      }
    } catch (error) {
      if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
    }
    await setTimeout(250, undefined, { signal });
  }
}
