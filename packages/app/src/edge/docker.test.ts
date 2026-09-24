import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { readBridgeToken } from "../host-cli/paths.js";
import { startHostServer } from "../host-cli/server.js";
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
it.skipIf(process.platform !== "linux").each([true, false])(
  "sets up only after consent with a compatible image (cached: %s), then reuses the receipt",
  async (cached) => {
    const h = await setup();
    let inspected = 0;
    let installed = false;
    let server: Awaited<ReturnType<typeof startHostServer>> | undefined;
    let prompts = 0;
    const options: DockerHostOptions = {
      ...h.options,
      interactive: true,
      prompt: async () => {
        prompts++;
        return true;
      },
      runner: {
        exec: async (file, args) => {
          h.calls.push([file, ...args]);
          if (file === "docker")
            return {
              code: 0,
              stdout: args.includes("inspect") && (cached || inspected++ > 0) ? "1" : "",
            };
          if (args.includes("install")) {
            const prefix = args[args.indexOf("--prefix") + 1];
            if (!prefix) throw new Error("Missing install prefix");
            const path = join(prefix, "node_modules/@gentbajko/slopify");
            await mkdir(join(path, "dist/edge"), { recursive: true });
            await writeFile(
              join(path, "package.json"),
              JSON.stringify({ name: "@gentbajko/slopify", version: "1.4.0" }),
            );
            await writeFile(join(path, "dist/edge/host-cli.js"), "// fixture");
            installed = true;
          }
          if (args.includes("is-active") || args.includes("is-enabled"))
            return { code: server ? 0 : 3, stdout: "" };
          if (args.includes("start")) {
            expect(installed).toBe(true);
            server = await startHostServer({
              directory: join(options.root, "share"),
              token: await readBridgeToken(join(options.root, "share/token")),
              version: "1.4.0",
              ports: {
                status: async (id) => ({
                  id,
                  command: "fixture",
                  installed: true,
                  login: "unknown",
                }),
                llm: () => {
                  throw new Error("unused");
                },
                image: {
                  id: "codex-image",
                  models: async () => [],
                  generate: async () => {
                    throw new Error("unused");
                  },
                },
              },
            });
          }
          return { code: 0, stdout: file === "loginctl" ? "yes" : "" };
        },
      },
    };
    try {
      expect(await prepareDockerHostCli(options)).toEqual({
        directory: join(options.root, "share"),
      });
      await prepareDockerHostCli({ ...options, interactive: false });
      expect(prompts).toBe(1);
      expect(h.calls.filter((c) => c.includes("install"))).toHaveLength(1);
      expect(h.calls.filter((c) => c.includes("pull"))).toHaveLength(cached ? 0 : 1);
      expect(JSON.parse(await readFile(join(options.root, "consent.json"), "utf8"))).toEqual({
        version: 1,
        automaticStartup: true,
      });
      expect(h.calls.flat()).not.toContain("slopify.service");
    } finally {
      await server?.stop();
    }
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
