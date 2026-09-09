import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareModel } from "./cache.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function cache(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "slopify-model-test-"));
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

describe("alignment model cache", () => {
  it("downloads, verifies and reuses a model without more network requests", async () => {
    const dir = await cache();
    let calls = 0;
    const fetchModel: typeof fetch = async () => {
      calls += 1;
      return new Response(bytes);
    };
    const file = await prepareModel(
      { cacheDir: dir, signal: new AbortController().signal },
      { model, fetch: fetchModel },
    );
    expect(await readFile(file)).toEqual(Buffer.from(bytes));
    await prepareModel(
      { cacheDir: dir, signal: new AbortController().signal },
      { model, fetch: fetchModel },
    );
    expect(calls).toBe(1);
  });
  it("replaces a corrupt cached model only with verified bytes", async () => {
    const dir = await cache();
    await writeFile(join(dir, model.filename), "corrupt");
    const file = await prepareModel(
      { cacheDir: dir, signal: new AbortController().signal },
      { model, fetch: async () => new Response(bytes) },
    );
    expect(await readFile(file)).toEqual(Buffer.from(bytes));
  });
  it("rejects a bad checksum and removes partial files", async () => {
    const dir = await cache();
    await expect(
      prepareModel(
        { cacheDir: dir, signal: new AbortController().signal },
        { model, fetch: async () => new Response(new Uint8Array(bytes.length)) },
      ),
    ).rejects.toThrow(/verification/);
    expect(await readdir(dir)).toEqual([]);
  });
  it("allows concurrent requests without corrupting the shared model", async () => {
    const dir = await cache();
    const files = await Promise.all(
      Array.from({ length: 3 }, () =>
        prepareModel(
          { cacheDir: dir, signal: new AbortController().signal },
          { model, fetch: async () => new Response(bytes) },
        ),
      ),
    );
    expect(new Set(files).size).toBe(1);
    expect(await readdir(dir)).toEqual([model.filename]);
  });
  it("cleans an interrupted download and does not write a reusable model", async () => {
    const dir = await cache();
    const controller = new AbortController();
    let sent = false;
    const fetchModel: typeof fetch = async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          pull(stream) {
            if (!sent) {
              sent = true;
              stream.enqueue(bytes.subarray(0, 2));
            } else {
              controller.abort();
              stream.close();
            }
          },
        }),
      );
    await expect(
      prepareModel({ cacheDir: dir, signal: controller.signal }, { model, fetch: fetchModel }),
    ).rejects.toThrow();
    expect(sent).toBe(true);
    expect(await readdir(dir)).toEqual([]);
  });
});
