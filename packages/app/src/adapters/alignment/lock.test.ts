import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claimWorker } from "./lock.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function cache(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "slopify-lock-test-"));
  roots.push(root);
  return root;
}

describe("alignment resource lock", () => {
  it("serializes workers sharing a data directory", async () => {
    const dir = await cache();
    const release = await claimWorker(dir, new AbortController().signal);
    let entered = false;
    const next = claimWorker(dir, new AbortController().signal).then((release) => {
      entered = true;
      return release;
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(entered).toBe(false);
    await release();
    await (await next)();
  });
  it("allows a waiting request to cancel without taking another request's lock", async () => {
    const dir = await cache();
    const release = await claimWorker(dir, new AbortController().signal);
    const controller = new AbortController();
    const next = claimWorker(dir, controller.signal);
    controller.abort();
    await expect(next).rejects.toThrow();
    expect(await readFile(join(dir, "alignment-worker.lock"), "utf8")).toBe(String(process.pid));
    await release();
  });
  it("recovers a lock left by a terminated process", async () => {
    const dir = await cache();
    await writeFile(join(dir, "alignment-worker.lock"), "2147483647");
    await (await claimWorker(dir, new AbortController().signal))();
  });
});
