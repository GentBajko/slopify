import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { type ModelDeps, prepareModel } from "./cache.js";
import { claimWorker } from "./lock.js";

export interface PrefetchInput {
  readonly cacheDir: string;
  readonly seed?: string | undefined;
  readonly signal: AbortSignal;
}

// Readies the subtitle model when the app starts, so the first captioned render never waits
// on a 95 MB download in the middle of a run. It takes the worker lock, so a render that
// starts meanwhile waits for this copy rather than fetching a second one.
export async function prefetchModel(input: PrefetchInput, deps?: ModelDeps): Promise<string> {
  await mkdir(input.cacheDir, { recursive: true, mode: 0o700 });
  await clearOwnLock(input.cacheDir);
  const release = await claimWorker(input.cacheDir, input.signal);
  try {
    return await prepareModel(
      { cacheDir: input.cacheDir, seed: input.seed, signal: input.signal },
      deps,
    );
  } finally {
    await release();
  }
}

// The lock names its holder by pid. A lock that names this process when the app has only
// just started was left by an earlier run: in a container the app is always pid 1, so the
// liveness check in claimWorker would take it for a live holder and wait forever.
async function clearOwnLock(cacheDir: string): Promise<void> {
  const path = join(cacheDir, "alignment-worker.lock");
  let owner: string;
  try {
    owner = await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  if (Number(owner) === process.pid) await rm(path, { force: true });
}
