import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { HostCliPorts } from "../kernel/ports/host-cli.js";
import { hostEnvironment } from "./environment.js";
import { ensureBridgeToken, prepareHostPaths } from "./paths.js";
import { startHostServer } from "./server.js";
import { ensureHostService, helperHealth, serviceUnit } from "./service.js";

const roots: string[] = [];
it("rolls back a failed first start without touching unrelated services or disabling lingering", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(root);
  const calls: string[][] = [];
  await expect(
    ensureHostService({
      root,
      entry: "/entry",
      node: process.execPath,
      uid: process.getuid?.() ?? 0,
      version: "1.4.0",
      env: { HOME: root, PATH: "/bin" },
      signal: AbortSignal.timeout(2000),
      runner: {
        exec: async (file, args) => {
          calls.push([file, ...args]);
          return {
            code: args.some((arg) => ["start", "is-active", "is-enabled"].includes(arg)) ? 1 : 0,
            stdout: file === "loginctl" ? "yes" : "",
          };
        },
      },
    }),
  ).rejects.toThrow("setup failed");
  await expect(readFile(join(root, "host-environment.json"))).rejects.toMatchObject({
    code: "ENOENT",
  });
  await expect(
    readFile(join(root, ".config/systemd/user/slopify-cli-bridge.service")),
  ).rejects.toMatchObject({ code: "ENOENT" });
  expect(calls).toContainEqual(["systemctl", "--user", "disable", "slopify-cli-bridge.service"]);
  expect(calls.flat()).not.toContain("disable-linger");
});
it.skipIf(process.platform === "win32")(
  "starts a dedicated service, then reuses the same healthy configuration",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sb-"));
    roots.push(root);
    const paths = await prepareHostPaths(root);
    const token = await ensureBridgeToken(paths.tokenFile);
    const calls: string[][] = [];
    let server: Awaited<ReturnType<typeof startHostServer>> | undefined;
    const ports: HostCliPorts = {
      status: async (id) => ({ id, command: "fixture", installed: true, login: "unknown" }),
      llm: () => {
        throw new Error("Unused");
      },
      image: {
        id: "codex-image",
        models: async () => [],
        generate: async () => {
          throw new Error("Unused");
        },
      },
    };
    const options = {
      root,
      entry: "/entry",
      node: process.execPath,
      uid: process.getuid?.() ?? 0,
      version: "1.4.0",
      env: { HOME: root, PATH: "/bin" },
      signal: AbortSignal.timeout(3000),
      runner: {
        exec: async (file: string, args: readonly string[]) => {
          calls.push([file, ...args]);
          if (args.includes("start"))
            server = await startHostServer({
              directory: paths.share,
              token,
              version: "1.4.0",
              ports,
            });
          if (args.includes("is-active")) return { code: server ? 0 : 3, stdout: "" };
          if (args.includes("is-enabled")) return { code: server ? 0 : 1, stdout: "" };
          return { code: 0, stdout: file === "loginctl" ? "yes" : "" };
        },
      },
    };
    try {
      await ensureHostService(options);
      await ensureHostService(options);
      expect(calls.filter((c) => c.includes("start"))).toHaveLength(1);
      expect(calls.flat()).not.toContain("slopify.service");
      expect(JSON.parse(await readFile(join(root, "host-environment.json"), "utf8"))).toEqual(
        options.env,
      );
      expect((await helperHealth(root, options.signal))?.accepting).toBe(true);
    } finally {
      await server?.stop();
    }
  },
);
it.skipIf(process.platform === "win32")(
  "refuses a busy upgrade and resumes the old helper without changing configuration",
  async () => {
    const root = await mkdtemp(join(tmpdir(), "sb-"));
    roots.push(root);
    const paths = await prepareHostPaths(root);
    const token = await ensureBridgeToken(paths.tokenFile);
    const directory = join(root, ".config/systemd/user");
    await mkdir(directory, { recursive: true });
    const unitPath = join(directory, "slopify-cli-bridge.service");
    const old = serviceUnit(process.execPath, "/old-entry", root);
    await writeFile(unitPath, old, { mode: 0o600 });
    let began = () => {};
    const started = new Promise<void>((resolve) => {
      began = resolve;
    });
    const ports: HostCliPorts = {
      status: async (id) => ({ id, command: "fixture", installed: true, login: "unknown" }),
      llm: () => {
        throw new Error("Unused");
      },
      image: {
        id: "codex-image",
        models: async () => [],
        generate: async (req) => {
          began();
          await new Promise<void>((_resolve, reject) =>
            req.signal.addEventListener("abort", () => reject(new Error("aborted")), {
              once: true,
            }),
          );
          throw new Error("Unexpected");
        },
      },
    };
    const server = await startHostServer({
      directory: paths.share,
      token,
      version: "1.3.1",
      ports,
    });
    const calls: string[][] = [];
    const call = request({
      socketPath: paths.socket,
      path: "/v1/image",
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    });
    call.on("error", () => {});
    call.end(JSON.stringify({ model: "codex-imagegen", prompt: "test", aspect: "16:9" }));
    await started;
    const signal = AbortSignal.timeout(3000);
    try {
      await expect(
        ensureHostService({
          root,
          entry: "/new-entry",
          node: process.execPath,
          uid: process.getuid?.() ?? 0,
          version: "1.4.0",
          env: { HOME: root, PATH: "/bin" },
          signal,
          runner: {
            exec: async (file, args) => {
              calls.push([file, ...args]);
              if (args.includes("--signal=SIGHUP")) server.pauseAdmissions();
              if (args.includes("--signal=SIGUSR2")) server.resumeAdmissions();
              return { code: 0, stdout: file === "loginctl" ? "yes" : "" };
            },
          },
        }),
      ).rejects.toThrow("doing work");
      expect(await readFile(unitPath, "utf8")).toBe(old);
      expect((await helperHealth(root, signal))?.accepting).toBe(true);
      expect(calls.flat()).not.toContain("restart");
    } finally {
      call.destroy();
      await server.stop();
    }
  },
);
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it("quotes service paths without shell, environment or percent expansion", () => {
  const unit = serviceUnit("/node path/100%$NODE", '/entry"name/file.js', "/root\\name");
  expect(unit).toContain('ExecStart=:"/node path/100%%$NODE"');
  expect(unit).toContain('"/entry\\"name/file.js"');
  expect(unit).toContain("KillMode=control-group");
  expect(unit).toContain("Restart=on-failure");
  expect(() => serviceUnit("relative", "/entry", "/root")).toThrow();
  expect(() => serviceUnit("/node\nBad=yes", "/entry", "/root")).toThrow();
});
it("captures only non-secret host environment paths", () => {
  expect(
    hostEnvironment({
      HOME: "/host",
      PATH: "/bin",
      CODEX_HOME: "/codex",
      GEMINI_API_KEY: "fixture-never-copy",
      OTHER: "ignored",
    }),
  ).toEqual({ HOME: "/host", PATH: "/bin", CODEX_HOME: "/codex" });
  expect(() => hostEnvironment({ HOME: "/host", PATH: "/bin\nINJECTED" })).toThrow();
});
it("refuses an unowned service without addressing any old app service", async () => {
  const root = await mkdtemp(join(tmpdir(), "sb-"));
  roots.push(root);
  const env = { HOME: root, PATH: "/bin" };
  const directory = join(root, ".config/systemd/user");
  await mkdir(directory, { recursive: true });
  const unit = join(directory, "slopify-cli-bridge.service");
  await writeFile(unit, "Not managed by Slopify");
  const calls: string[][] = [];
  await expect(
    ensureHostService({
      root,
      entry: "/entry",
      node: process.execPath,
      uid: process.getuid?.() ?? 0,
      version: "1.4.0",
      env,
      signal: AbortSignal.timeout(1000),
      runner: {
        exec: async (_file, args) => {
          calls.push([...args]);
          return { code: 0, stdout: "" };
        },
      },
    }),
  ).rejects.toThrow("owned");
  expect(await readFile(unit, "utf8")).toBe("Not managed by Slopify");
  expect(calls.flat().some((value) => value === "slopify.service")).toBe(false);
});
