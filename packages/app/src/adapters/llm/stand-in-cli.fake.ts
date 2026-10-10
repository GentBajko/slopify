import { setTimeout as delay } from "node:timers/promises";
import { afterEach, expect } from "vitest";

// The stand-in CLIs these tests spawn are real processes. Each ends with the process that ran
// it (`parent`, the test worker): a worker killed or timed out before it stopped one would
// otherwise leave it running for hours (one outlived its run by five). Put first in a
// stand-in's script. The pid is written in, not read from `process.ppid`: a stand-in whose
// parent ended before it started would read its new parent's.
export function exitsWith(parent: number): string {
  return `setInterval(() => { try { process.kill(${String(parent)}, 0); } catch { process.exit(1); } }, 200).unref();\n`;
}

// Every stand-in a test file spawns: after each test the ones still running are killed, and the
// test fails if any survives.
export function reapStandIns(): (pid: number | undefined) => void {
  const pids = new Set<number>();
  afterEach(async () => {
    for (const pid of pids) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
    let survivors = [...pids].filter(alive);
    for (let tries = 0; tries < 50 && survivors.length > 0; tries += 1) {
      await delay(20);
      survivors = survivors.filter(alive);
    }
    pids.clear();
    expect(survivors, "a stand-in CLI survived its test").toEqual([]);
  });
  return (pid) => {
    if (pid !== undefined) pids.add(pid);
  };
}

export function alive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
