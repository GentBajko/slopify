import { availableParallelism, totalmem } from "node:os";

// zoompan runs on one core, so a render of one clip at a time leaves most of the machine
// idle. Measured on 32 cores with ffmpeg 7 and 15-second clips from a 4x still: one at a time
// 8.1 s a clip, four at once 2.9 s, eight 1.9 s, sixteen 1.6 s. Eight is where the gain
// flattens, and each run holds about 1.4 GB (a transition, two stills, twice that), so the
// memory the process may use caps it as well.
const mostJobs = 8;
const coresPerJob = 4;
const bytesPerJob = 3 * 1024 ** 3;

export function renderJobs(
  cores: number = availableParallelism(),
  memory: number = usableMemory(),
): number {
  return Math.max(
    1,
    Math.min(mostJobs, Math.floor(cores / coresPerJob), Math.floor(memory / 2 / bytesPerJob)),
  );
}

// A container's memory limit, when it has one below the machine's.
function usableMemory(): number {
  const limit = process.constrainedMemory();
  const total = totalmem();
  return limit > 0 && limit < total ? limit : total;
}

// Runs `work` over every item, at most `limit` at once, in the items' order. The first failure
// stops the rest: nothing new starts, the runs already going are aborted through the signal
// each was given, and once they have all ended the first failure is the one thrown, not the
// cancellations it caused.
export async function inPool<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  work: (item: T, signal: AbortSignal) => Promise<void>,
): Promise<void> {
  if (signal.aborted) throw new Error("the render was canceled before it started");
  const stop = new AbortController();
  const follow = (): void => {
    stop.abort();
  };
  signal.addEventListener("abort", follow, { once: true });
  let next = 0;
  let failed: { readonly error: unknown } | undefined;
  const runner = async (): Promise<void> => {
    while (failed === undefined && !stop.signal.aborted && next < items.length) {
      const at = next;
      next += 1;
      try {
        await work(items[at] as T, stop.signal);
      } catch (error) {
        failed ??= { error };
        stop.abort();
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runner));
  } finally {
    signal.removeEventListener("abort", follow);
  }
  if (failed !== undefined) throw failed.error;
  if (signal.aborted) throw new Error("the render was canceled");
}
