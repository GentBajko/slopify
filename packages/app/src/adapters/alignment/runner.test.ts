import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { runAlignmentWorker } from "./runner.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function script(code: string): Promise<URL> {
  const root = await mkdtemp(join(tmpdir(), "slopify-worker-test-"));
  roots.push(root);
  const file = join(root, "worker.cjs");
  await writeFile(file, code);
  return pathToFileURL(file);
}
const request = { modelPath: "/unused", pcmPath: "/unused", text: "Hello" };

describe("isolated subtitle worker", () => {
  it("returns validated timing data from the child", async () => {
    const worker = await script(
      'process.on("message", () => process.send({type:"done",words:[{text:"Hello",start:0,end:1,confidence:0.9}]}));',
    );
    expect(
      await runAlignmentWorker(request, new AbortController().signal, undefined, worker),
    ).toEqual([{ text: "Hello", start: 0, end: 1, confidence: 0.9 }]);
  });
  it("hard-stops a child that is busy and never responds", async () => {
    const worker = await script('process.on("message", () => { while (true) {} });');
    const controller = new AbortController();
    const running = runAlignmentWorker(request, controller.signal, undefined, worker);
    setTimeout(() => controller.abort(), 30);
    await expect(running).rejects.toThrow(/abort|cancel/i);
  });
  it("reports worker failures instead of hanging", async () => {
    const worker = await script('process.on("message", () => process.exit(3));');
    await expect(
      runAlignmentWorker(request, new AbortController().signal, undefined, worker),
    ).rejects.toThrow(/stopped/);
  });
});
