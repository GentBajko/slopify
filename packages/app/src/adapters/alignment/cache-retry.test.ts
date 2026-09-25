import { createHash } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
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

describe("alignment model download retries", () => {
  it.each(["fetch", "body", "http"] as const)(
    "recovers an interrupted %s transfer",
    async (kind) => {
      const dir = await cache();
      let calls = 0;
      const delays: number[] = [];
      const fetchModel: typeof fetch = async () => {
        calls += 1;
        if (calls > 1) return new Response(bytes);
        if (kind === "fetch") throw new TypeError("fetch failed");
        if (kind === "http") return new Response(null, { status: 503 });
        let sent = false;
        return new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              if (!sent) {
                sent = true;
                controller.enqueue(bytes.subarray(0, 2));
              } else controller.error(new TypeError("terminated"));
            },
            cancel() {
              throw new Error("secondary cancellation failure");
            },
          }),
        );
      };
      const file = await prepareModel(
        { cacheDir: dir, signal: new AbortController().signal },
        {
          model,
          fetch: fetchModel,
          wait: async (milliseconds, signal) => {
            signal.throwIfAborted();
            delays.push(milliseconds);
          },
        },
      );
      expect(await readFile(file)).toEqual(Buffer.from(bytes));
      expect(calls).toBe(2);
      expect(delays).toEqual([1000]);
      expect(await readdir(dir)).toEqual([model.filename]);
    },
  );
  it("stops after three transient failures", async () => {
    const dir = await cache();
    let calls = 0;
    const delays: number[] = [];
    await expect(
      prepareModel(
        { cacheDir: dir, signal: new AbortController().signal },
        {
          model,
          fetch: async () => {
            calls += 1;
            throw new TypeError("terminated");
          },
          wait: async (milliseconds) => {
            delays.push(milliseconds);
          },
        },
      ),
    ).rejects.toThrow(/subtitle model.*3 attempts/i);
    expect(calls).toBe(3);
    expect(delays).toEqual([1000, 2000]);
    expect(await readdir(dir)).toEqual([]);
  });
  it("does not start another attempt after cancellation during backoff", async () => {
    const dir = await cache();
    const controller = new AbortController();
    let calls = 0;
    await expect(
      prepareModel(
        { cacheDir: dir, signal: controller.signal },
        {
          model,
          fetch: async () => {
            calls += 1;
            throw new TypeError("fetch failed");
          },
          wait: async (_milliseconds, signal) => {
            controller.abort();
            signal.throwIfAborted();
          },
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(calls).toBe(1);
    expect(await readdir(dir)).toEqual([]);
  });
  it.each(["http", "checksum", "size"] as const)(
    "does not retry permanent %s failure",
    async (kind) => {
      const dir = await cache();
      let calls = 0;
      let waits = 0;
      await expect(
        prepareModel(
          { cacheDir: dir, signal: new AbortController().signal },
          {
            model,
            fetch: async () => {
              calls += 1;
              return kind === "http"
                ? new Response(null, { status: 404 })
                : new Response(new Uint8Array(bytes.length + (kind === "size" ? 1 : 0)));
            },
            wait: async () => {
              waits += 1;
            },
          },
        ),
      ).rejects.toThrow();
      expect(calls).toBe(1);
      expect(waits).toBe(0);
      expect(await readdir(dir)).toEqual([]);
    },
  );
});
