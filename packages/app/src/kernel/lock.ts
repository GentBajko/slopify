import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

export interface InstanceLock {
  readonly release: () => void;
}

// The lock records who holds it and when that process started. A pid alone is not enough: in
// a container the app is always pid 1, so after a hard shutdown the leftover lock names the
// new process itself and would refuse it forever.
interface Holder {
  readonly pid: number;
  readonly startedAt: number | undefined;
}

// Seconds since the epoch at which this process started, stable for its whole life.
const startedAt = Math.round(Date.now() / 1000 - process.uptime());

export function acquireInstanceLock(lockPath: string): InstanceLock {
  const pid = process.pid;
  if (!claim(lockPath, pid)) {
    const holder = holderOf(lockPath);
    if (holder !== undefined && holds(holder, pid)) {
      throw new Error(
        `Slopify is already running on this data directory (process ${holder.pid}). ` +
          "Use the copy that is already open, or stop it (Ctrl+C in its terminal) and start again. " +
          `If no Slopify is running, delete ${lockPath} and try again.`,
      );
    }
    // The recorded process is gone, or the file says nothing usable. Reclaiming it here
    // is what keeps a crash from bricking the data directory until a file is deleted by hand.
    discard(lockPath);
    if (!claim(lockPath, pid)) {
      throw new Error(
        `Another Slopify started on this data directory at the same moment (lock file ${lockPath}). Close the extra copy and start Slopify again.`,
      );
    }
  }
  return {
    release: (): void => {
      const holder = holderOf(lockPath);
      if (holder?.pid === pid && holder.startedAt === startedAt) {
        discard(lockPath);
      }
    },
  };
}

function claim(lockPath: string, pid: number): boolean {
  try {
    writeFileSync(lockPath, `${pid} ${startedAt}\n`, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (errnoOf(error) === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function holderOf(lockPath: string): Holder | undefined {
  let contents: string;
  try {
    contents = readFileSync(lockPath, "utf8");
  } catch {
    return undefined;
  }
  const [pidText = "", startText] = contents.trim().split(/\s+/);
  const pid = Number(pidText);
  if (!Number.isInteger(pid) || pid <= 0) return undefined;
  const started = startText === undefined ? undefined : Number(startText);
  return { pid, startedAt: Number.isInteger(started) ? started : undefined };
}

// A lock naming this very pid is live only if this process wrote it; one from an earlier
// process that reused the pid (a restarted container) is stale.
function holds(holder: Holder, pid: number): boolean {
  if (holder.pid === pid) return holder.startedAt === startedAt;
  return isAlive(holder.pid);
}

function discard(lockPath: string): void {
  try {
    unlinkSync(lockPath);
  } catch (error) {
    if (errnoOf(error) !== "ENOENT") {
      throw error;
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    // EPERM means the process exists and belongs to someone else.
    return errnoOf(error) === "EPERM";
  }
}

function errnoOf(error: unknown): string | undefined {
  if (error instanceof Error && "code" in error && typeof error.code === "string") {
    return error.code;
  }
  return undefined;
}
