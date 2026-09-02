import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireInstanceLock } from "./lock.js";

function lockPath(): string {
  return join(mkdtempSync(join(tmpdir(), "slopify-lock-")), ".lock");
}

// A pid that is certainly gone: spawnSync only returns once the child has been reaped.
function deadPid(): number {
  const { pid } = spawnSync(process.execPath, ["-e", ""]);
  if (pid === undefined) {
    throw new Error("could not spawn a process to retire");
  }
  return pid;
}

describe("acquireInstanceLock", () => {
  it("writes the holding pid and removes the file on release", () => {
    const path = lockPath();

    const lock = acquireInstanceLock(path);
    expect(readFileSync(path, "utf8").trim()).toBe(String(process.pid));

    lock.release();
    expect(() => readFileSync(path, "utf8")).toThrow();
  });

  it("refuses a second holder while the first is alive", () => {
    const path = lockPath();
    acquireInstanceLock(path);

    expect(() => acquireInstanceLock(path)).toThrow(
      /already running on this data directory \(pid \d+\)/,
    );
  });

  it("reclaims a lock whose process is gone", () => {
    const path = lockPath();
    writeFileSync(path, `${deadPid()}\n`);

    const lock = acquireInstanceLock(path);

    expect(readFileSync(path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("reclaims a lock file that holds no readable pid", () => {
    const path = lockPath();
    writeFileSync(path, "");

    const lock = acquireInstanceLock(path);

    expect(readFileSync(path, "utf8").trim()).toBe(String(process.pid));
    lock.release();
  });

  it("leaves a lock taken over by someone else alone on release", () => {
    const path = lockPath();
    const lock = acquireInstanceLock(path);
    const other = String(deadPid());
    writeFileSync(path, `${other}\n`);

    lock.release();

    expect(readFileSync(path, "utf8").trim()).toBe(other);
  });
});
