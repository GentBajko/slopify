import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { launchUpdate } from "./install.js";
import type { UpdatePlan } from "./plan.js";

const directories: string[] = [];
afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});
async function fixture(script: string) {
  const root = await mkdtemp(join(tmpdir(), "slopify-update-ipc-"));
  directories.push(root);
  const worker = join(root, "worker.cjs");
  await writeFile(worker, script);
  const plan: UpdatePlan = {
    token: "a".repeat(64),
    version: "0.6.2",
    previousVersion: "0.6.1",
    oldEntry: join(root, "old.js"),
    dataDir: root,
    cwd: root,
    host: "127.0.0.1",
    port: 6969,
    npm: { file: process.execPath, args: [] },
  };
  return { root, worker, plan };
}
it("hands off only when the detached worker reports a verified install", async () => {
  const f = await fixture(
    "process.once('message', m => process.exit(m.type === 'handoff' ? 0 : 1)); process.send({type:'installed'});",
  );
  let stopped = false;
  await launchUpdate(f.worker, f.plan, async () => {
    stopped = true;
  });
  expect(stopped).toBe(true);
  expect(await readdir(join(f.root, "updates"))).toEqual([]);
});
it("keeps the parent serving if the worker fails before installation and cleans its private plan", async () => {
  const f = await fixture("process.exit(1)");
  let stopped = false;
  await expect(
    launchUpdate(f.worker, f.plan, async () => {
      stopped = true;
    }),
  ).rejects.toThrow("could not finish");
  expect(stopped).toBe(false);
  expect(await readdir(join(f.root, "updates"))).toEqual([]);
});
