import { lstat, mkdtemp, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { HostCliPorts } from "../kernel/ports/host-cli.js";
import { prepareHostPaths } from "./paths.js";
import { startHostServer } from "./server.js";
import { helperHealth } from "./service.js";

const cleanups: (() => Promise<void>)[] = [];
it.skipIf(process.platform === "win32")(
  "aborts only the disconnected image and releases its slot after cleanup",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sb-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const paths = await prepareHostPaths(root);
    let startedResolve = () => {};
    let stoppedResolve = () => {};
    let finishCleanup = () => {};
    const cleanupDone = new Promise<void>((resolve) => {
      finishCleanup = resolve;
    });
    const started = {
      promise: new Promise<void>((resolve) => {
        startedResolve = resolve;
      }),
      resolve: () => startedResolve(),
    };
    const stopped = {
      promise: new Promise<void>((resolve) => {
        stoppedResolve = resolve;
      }),
      resolve: () => stoppedResolve(),
    };
    const ports: HostCliPorts = {
      status: async (id) => ({ id, command: "test", installed: true, login: "unknown" }),
      llm: () => {
        throw new Error("unused");
      },
      image: {
        id: "codex-image",
        models: async () => [],
        generate: async (req) => {
          started.resolve();
          try {
            await new Promise<void>((_resolve, reject) =>
              req.signal.addEventListener("abort", () => reject(new Error("canceled")), {
                once: true,
              }),
            );
            throw new Error("unexpected");
          } finally {
            stopped.resolve();
            await cleanupDone;
          }
        },
      },
    };
    const server = await startHostServer({
      directory: paths.share,
      token: "a".repeat(64),
      version: "1.4.0",
      ports,
    });
    cleanups.push(server.stop);
    cleanups.push(async () => finishCleanup());
    await writeFile(paths.tokenFile, "a".repeat(64), { mode: 0o644 });
    const call = request({
      socketPath: paths.socket,
      path: "/v1/image",
      method: "POST",
      headers: { authorization: `Bearer ${"a".repeat(64)}`, "content-type": "application/json" },
    });
    call.on("error", () => {});
    call.end(JSON.stringify({ model: "codex-imagegen", prompt: "test", aspect: "16:9" }));
    await started.promise;
    call.destroy();
    await stopped.promise;
    expect((await helperHealth(root, AbortSignal.timeout(1000)))?.active).toBe(1);
    finishCleanup();
    await expect
      .poll(async () => (await helperHealth(root, AbortSignal.timeout(1000)))?.active)
      .toBe(0);
  },
);
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});
it.skipIf(process.platform === "win32")(
  "uses only a Unix socket, refuses a live socket and reconnects after restart",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sb-"));
    cleanups.push(() => rm(root, { recursive: true, force: true }));
    const paths = await prepareHostPaths(root);
    const ports: HostCliPorts = {
      status: async (id) => ({ id, command: "test", installed: true, login: "unknown" }),
      llm: () => {
        throw new Error("not used");
      },
      image: {
        id: "codex-image",
        models: async () => [],
        generate: async () => {
          throw new Error("not used");
        },
      },
    };
    const options = { directory: paths.share, token: "a".repeat(64), version: "1.4.0", ports };
    const first = await startHostServer(options);
    cleanups.push(first.stop);
    expect((await lstat(paths.socket)).mode & 0o777).toBe(0o666);
    const health = () =>
      new Promise<string>((resolve, reject) => {
        const req = request(
          {
            socketPath: paths.socket,
            path: "/v1/health",
            headers: { authorization: `Bearer ${options.token}` },
          },
          (res) => {
            let text = "";
            res.on("data", (chunk) => {
              text += chunk;
            });
            res.on("end", () => resolve(text));
          },
        );
        req.on("error", reject);
        req.end();
      });
    expect(JSON.parse(await health())).toMatchObject({ protocol: 1, active: 0, accepting: true });
    await expect(startHostServer(options)).rejects.toThrow("listening");
    first.pauseAdmissions();
    expect(JSON.parse(await health()).accepting).toBe(false);
    first.resumeAdmissions();
    await first.stop();
    const second = await startHostServer(options);
    cleanups.push(second.stop);
    expect(JSON.parse(await health()).accepting).toBe(true);
  },
);
