import { availableParallelism } from "node:os";
import type { FfmpegRun } from "../loudness/loudnorm.js";

// The join's per-piece steps (levelling, each sentence, breaths, S sounds, pauses) are each one
// ffmpeg audio pass per piece, and an audio pass keeps about one core busy. One piece at a time
// left a 32-thread machine nearly idle for most of an hour on a 2.5-hour narration, so several
// pieces go at once. Measured on 32 threads, eight real 4.8-minute pieces through levelling,
// each sentence, breaths, S sounds and pauses: one at a time 87 s, three 34 s, six 24 s, eight
// 14 s (all eight in one go), twelve 15 s. A render or another project's run may want the
// machine as well, so six is the most, and four cores are counted for each.
export const mostPieceJobs = 6;
const coresPerPieceJob = 4;

export function pieceJobs(cores: number = availableParallelism()): number {
  return Math.max(1, Math.min(mostPieceJobs, Math.floor(cores / coresPerPieceJob)));
}

// `work` over every item, at most `run.jobs` (else `pieceJobs()`) at once, the results in the
// items' order. Each call is given a run of its own whose signal ends with the caller's, so
// cancelling the run stops what is going and nothing new starts. The first failure stops the
// rest the same way, and once every call has ended that failure is the one thrown, not the
// cancellations it caused.
export async function mapPieces<T, R>(
  run: FfmpegRun,
  items: readonly T[],
  work: (item: T, index: number, run: FfmpegRun) => Promise<R>,
): Promise<R[]> {
  run.signal.throwIfAborted();
  const stop = new AbortController();
  const follow = (): void => {
    stop.abort(run.signal.reason);
  };
  run.signal.addEventListener("abort", follow, { once: true });
  const own: FfmpegRun = { ...run, signal: stop.signal };
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  let failed: { readonly error: unknown } | undefined;
  const runner = async (): Promise<void> => {
    while (failed === undefined && !stop.signal.aborted && next < items.length) {
      const at = next;
      next += 1;
      try {
        results[at] = await work(items[at] as T, at, own);
      } catch (error) {
        failed ??= { error };
        stop.abort(error);
      }
    }
  };
  const limit = Math.max(1, Math.min(run.jobs ?? pieceJobs(), items.length));
  try {
    await Promise.all(Array.from({ length: limit }, runner));
  } finally {
    run.signal.removeEventListener("abort", follow);
  }
  if (failed !== undefined) throw failed.error;
  run.signal.throwIfAborted();
  return results;
}
