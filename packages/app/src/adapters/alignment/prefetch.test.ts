import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prefetchModel } from "./prefetch.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function cache(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "slopify-prefetch-test-"));
  roots.push(root);
  return root;
}
const bytes = new TextEncoder().encode("a model fixture");
const model = {
  filename: "model.onnx",
  url: "https://example.test/model",
  bytes: bytes.length,
  sha256: createHash("sha256").update(bytes).digest("hex"),
};
const deps = { model, fetch: async () => new Response(bytes) };

describe("subtitle model prefetch", () => {
  it("readies the model in a directory that does not exist yet and releases the lock", async () => {
    const dir = join(await cache(), "models", "english-subtitles");
    const file = await prefetchModel({ cacheDir: dir, signal: new AbortController().signal }, deps);
    expect(await readFile(file)).toEqual(Buffer.from(bytes));
    await expect(readFile(join(dir, "alignment-worker.lock"))).rejects.toThrow(/ENOENT/);
  });
  it("clears a lock left by an earlier run under this process's pid", async () => {
    // In a container the app is pid 1 on every start, so the leftover names a live process.
    const dir = await cache();
    await writeFile(join(dir, "alignment-worker.lock"), String(process.pid));
    const signal = AbortSignal.timeout(5_000);
    await expect(prefetchModel({ cacheDir: dir, signal }, deps)).resolves.toBe(
      join(dir, model.filename),
    );
  });
  it("waits for a lock held by another live process", async () => {
    const dir = await cache();
    await writeFile(join(dir, "alignment-worker.lock"), String(process.ppid));
    await expect(
      prefetchModel({ cacheDir: dir, signal: AbortSignal.timeout(600) }, deps),
    ).rejects.toThrow();
    expect(await readFile(join(dir, "alignment-worker.lock"), "utf8")).toBe(String(process.ppid));
  });
});
