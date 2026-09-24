import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { type DockerHostOptions, prepareDockerHostCli } from "./docker.js";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
async function setup() {
  const root = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(root);
  await writeFile(join(root, "codex"), "#!/bin/sh\nexit 0\n");
  await chmod(join(root, "codex"), 0o700);
  const calls: string[][] = [];
  const options: DockerHostOptions = {
    root: join(root, "state"),
    version: "1.4.0",
    image: "candidate",
    disabled: false,
    accepted: false,
    interactive: false,
    prompt: async () => false,
    runner: {
      exec: async (file, args) => {
        calls.push([file, ...args]);
        return { code: 0, stdout: "" };
      },
    },
    env: { HOME: root, PATH: root },
    signal: AbortSignal.timeout(2000),
  };
  return { options, calls };
}
it.skipIf(process.platform === "win32")(
  "requires explicit first-run consent before any subprocess or writes",
  async () => {
    const h = await setup();
    await expect(prepareDockerHostCli(h.options)).rejects.toThrow("--accept-host-cli");
    expect(h.calls).toEqual([]);
    await expect(prepareDockerHostCli({ ...h.options, interactive: true })).rejects.toThrow(
      "declined",
    );
    expect(h.calls).toEqual([]);
  },
);
it("keeps API-only mode free of helper setup", async () => {
  const h = await setup();
  expect(await prepareDockerHostCli({ ...h.options, disabled: true })).toEqual({});
  expect(h.calls).toEqual([]);
  expect(
    await prepareDockerHostCli({ ...h.options, env: { ...h.options.env, PATH: "/nonexistent" } }),
  ).toEqual({});
  expect(h.calls).toEqual([]);
});
it.skipIf(process.platform === "win32")(
  "pulls and rechecks incompatible images before attempting service changes",
  async () => {
    const h = await setup();
    await expect(prepareDockerHostCli({ ...h.options, accepted: true })).rejects.toThrow("image");
    expect(h.calls.map((c) => c.slice(0, 2))).toEqual([
      ["docker", "image"],
      ["docker", "pull"],
      ["docker", "image"],
    ]);
  },
);
