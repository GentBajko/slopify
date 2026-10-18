import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A short-lived CLI child that is asked one thing over stdin/stdout and then ended: the
// model and limit discovery exchanges. It owns the process lifecycle those share: a private
// working directory, a process group so grandchildren die too, a deadline, SIGTERM then
// SIGKILL after a grace, and the directory removed at the end.
export interface ChildSessionSpec {
  readonly file: string;
  readonly args: readonly string[];
  // Given the private working directory the child starts in.
  readonly env: (directory: string) => NodeJS.ProcessEnv;
  readonly directoryPrefix: string;
  readonly timeoutMs: number;
  // At the deadline: SIGKILL at once, or SIGTERM and then SIGKILL after this many ms.
  readonly killAfterTermMs?: number | undefined;
  // After the work: SIGTERM, then SIGKILL if the child has not closed within this long.
  readonly graceMs: number;
  // After that SIGKILL, how long to wait for the child to close before removing its directory.
  readonly settleMs?: number | undefined;
}

export interface ChildSession {
  readonly child: ChildProcessWithoutNullStreams;
  send(message: unknown): void;
}

export async function withChildSession<T>(
  spec: ChildSessionSpec,
  work: (session: ChildSession) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), spec.directoryPrefix));
  const child = spawn(spec.file, [...spec.args], {
    cwd: directory,
    env: spec.env(directory),
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    detached: process.platform !== "win32",
  });
  child.on("error", () => {});
  child.stdin.on("error", () => {});
  child.stderr.resume();
  const closed = new Promise<void>((resolve) => child.once("close", () => resolve()));
  const terminate = (signal: NodeJS.Signals): void => {
    if (process.platform !== "win32" && child.pid !== undefined) {
      try {
        process.kill(-child.pid, signal);
        return;
      } catch {
        // A child that already exited has no process group to signal.
      }
    }
    child.kill(signal);
  };
  let forceTimer: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    if (spec.killAfterTermMs === undefined) {
      terminate("SIGKILL");
      return;
    }
    terminate("SIGTERM");
    forceTimer = setTimeout(() => terminate("SIGKILL"), spec.killAfterTermMs);
  }, spec.timeoutMs);
  try {
    return await work({
      child,
      send: (message) => {
        child.stdin.write(`${JSON.stringify(message)}\n`);
      },
    });
  } finally {
    clearTimeout(timer);
    if (forceTimer !== undefined) clearTimeout(forceTimer);
    terminate("SIGTERM");
    if (!(await closesWithin(closed, spec.graceMs))) {
      terminate("SIGKILL");
      if (spec.settleMs !== undefined) await closesWithin(closed, spec.settleMs);
    }
    await rm(directory, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 });
  }
}

async function closesWithin(closed: Promise<void>, ms: number): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      closed.then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// The child's output, ended with an error once more than `maxBytes` has arrived.
export async function* cappedOutput(
  chunks: AsyncIterable<Uint8Array>,
  maxBytes: number,
  oversize: () => Error,
): AsyncGenerator<Uint8Array> {
  let bytes = 0;
  for await (const chunk of chunks) {
    bytes += chunk.byteLength;
    if (bytes > maxBytes) throw oversize();
    yield chunk;
  }
}
