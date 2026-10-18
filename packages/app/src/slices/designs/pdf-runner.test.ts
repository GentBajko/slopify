import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runPdfWorker } from "./pdf-runner.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function script(code: string): Promise<URL> {
  const root = await mkdtemp(join(tmpdir(), "slopify-pdf-worker-test-"));
  roots.push(root);
  const file = join(root, "worker.cjs");
  await writeFile(file, code);
  return pathToFileURL(file);
}
const job = {
  kind: "poster",
  png: new Uint8Array([1, 2, 3]),
  widthMm: 210,
  heightMm: 297,
} as const;

describe("the PDF worker", () => {
  it("sends the job's bytes and returns the PDF's", async () => {
    const worker = await script(
      'process.on("message", (job) => process.send({ type: "done", bytes: new Uint8Array([...job.png].reverse()) }));',
    );
    expect(await runPdfWorker(job, new AbortController().signal, worker)).toEqual(
      new Uint8Array([3, 2, 1]),
    );
  });

  it("kills a worker that is busy when the download is canceled", async () => {
    const worker = await script('process.on("message", () => { while (true) {} });');
    const controller = new AbortController();
    const running = runPdfWorker(job, controller.signal, worker);
    setTimeout(() => controller.abort(), 30);
    await expect(running).rejects.toThrow("Making the PDF was canceled.");
  });

  it("stops a worker that takes too long", async () => {
    const worker = await script('process.on("message", () => { while (true) {} });');
    await expect(runPdfWorker(job, new AbortController().signal, worker, 50)).rejects.toThrow(
      /longer than 5 minutes/,
    );
  });

  it("refuses an answer it can't read, and passes on the worker's own error", async () => {
    const odd = await script(
      'process.on("message", () => process.send({ type: "done", bytes: "not bytes" }));',
    );
    await expect(runPdfWorker(job, new AbortController().signal, odd)).rejects.toThrow(
      /can't read/,
    );
    const failing = await script(
      'process.on("message", () => process.send({ type: "error", message: "no fonts" }));',
    );
    await expect(runPdfWorker(job, new AbortController().signal, failing)).rejects.toThrow(
      "The PDF couldn't be made: no fonts",
    );
  });

  it("reports a worker that exits without answering", async () => {
    const worker = await script('process.on("message", () => process.exit(3));');
    await expect(runPdfWorker(job, new AbortController().signal, worker)).rejects.toThrow(
      /stopped \(exit 3\)/,
    );
  });

  it("starts nothing when already canceled", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(() => runPdfWorker(job, controller.signal, new URL("file:///nope.cjs"))).toThrow();
  });
});
