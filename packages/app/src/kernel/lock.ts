import { readFileSync, unlinkSync, writeFileSync } from "node:fs";

export interface InstanceLock {
  readonly release: () => void;
}

export function acquireInstanceLock(lockPath: string): InstanceLock {
  const pid = process.pid;
  if (!claim(lockPath, pid)) {
    const holder = holderOf(lockPath);
    if (holder !== undefined && isAlive(holder)) {
      throw new Error(
        `another Slopify instance is already running on this data directory (pid ${holder}). ` +
          `Stop it, or delete ${lockPath} if it is stale.`,
      );
    }
    // The recorded process is gone, or the file says nothing usable. Reclaiming it here
    // is what keeps a crash from bricking the data directory until a file is deleted by hand.
    discard(lockPath);
    if (!claim(lockPath, pid)) {
      throw new Error(
        `could not take the instance lock at ${lockPath}: another process was faster`,
      );
    }
  }
  return {
    release: (): void => {
      if (holderOf(lockPath) === pid) {
        discard(lockPath);
      }
    },
  };
}

function claim(lockPath: string, pid: number): boolean {
  try {
    writeFileSync(lockPath, `${pid}\n`, { flag: "wx", mode: 0o600 });
    return true;
  } catch (error) {
    if (errnoOf(error) === "EEXIST") {
      return false;
    }
    throw error;
  }
}

function holderOf(lockPath: string): number | undefined {
  let contents: string;
  try {
    contents = readFileSync(lockPath, "utf8");
  } catch {
    return undefined;
  }
  const pid = Number(contents.trim());
  return Number.isInteger(pid) && pid > 0 ? pid : undefined;
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
