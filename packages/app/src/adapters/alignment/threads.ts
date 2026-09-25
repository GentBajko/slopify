import { availableParallelism } from "node:os";

// Measured on a 32-thread machine, 5 min of narration in 12 s windows: one native CPU session with
// 8 intra-op threads ran 37× realtime; 16 threads 31×, 32 threads 20×, 1 thread 20×, and the old
// single-threaded WASM runtime 4.8×. More threads in one session gets slower, so 8 is the ceiling.
const maxThreads = 8;

export function subtitleThreads(
  env: Readonly<NodeJS.ProcessEnv> = process.env,
  cpus: number = availableParallelism(),
): number {
  const override = env.SLOPIFY_SUBTITLE_THREADS?.trim();
  if (override !== undefined && /^[1-9]\d*$/.test(override)) return Number(override);
  return Math.min(maxThreads, Math.max(1, cpus - 1));
}
