import { expect, it } from "vitest";
import { dockerEngine } from "./engine.js";

it.each([
  ["unix:///var/run/docker.sock", [], "1001:1002"],
  ["unix:///run/user/1001/docker.sock", ["name=rootless"], "0:0"],
] as const)("selects the local verified mapping for %s", async (host, security, user) => {
  const calls: string[][] = [];
  const e = dockerEngine(
    {
      exec: async (file, args) => {
        calls.push([file, ...args]);
        if (args[0] === "info")
          return {
            code: 0,
            stdout: JSON.stringify({
              ID: "daemon",
              OSType: "linux",
              OperatingSystem: "Ubuntu 24.04",
              SecurityOptions: security,
            }),
          };
        throw new Error("Unexpected fake command");
      },
    },
    AbortSignal.timeout(1000),
    { DOCKER_HOST: host },
  );
  expect(await e.context(1001, 1002)).toEqual({ daemon: "daemon", user });
  expect(calls.flat()).not.toContain("--userns=host");
});
it.each([
  { host: "ssh://remote", security: [] },
  { host: "tcp://127.0.0.1:2375", security: [] },
  { host: "unix:///var/run/docker.sock", security: ["name=userns"] },
])("refuses unsupported mappings before a mutating command", async ({ host, security }) => {
  const calls: string[][] = [];
  const e = dockerEngine(
    {
      exec: async (_file, args) => {
        calls.push([...args]);
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: "d",
            OSType: "linux",
            OperatingSystem: "Ubuntu 24.04",
            SecurityOptions: security,
          }),
        };
      },
    },
    AbortSignal.timeout(1000),
    { DOCKER_HOST: host },
  );
  await expect(e.context(1001, 1002)).rejects.toThrow();
  expect(calls.some((c) => ["run", "stop", "create", "update"].includes(c[0] ?? ""))).toBe(false);
});
it("refuses Docker Desktop's Linux VM before any storage mutation", async () => {
  const calls: string[][] = [];
  const e = dockerEngine(
    {
      exec: async (_file, args) => {
        calls.push([...args]);
        return {
          code: 0,
          stdout: JSON.stringify({
            ID: "desktop",
            OSType: "linux",
            OperatingSystem: "Docker Desktop",
            SecurityOptions: [],
          }),
        };
      },
    },
    AbortSignal.timeout(1000),
    { DOCKER_HOST: "unix:///home/user/.docker/desktop/docker.sock" },
  );
  await expect(e.context(1001, 1002)).rejects.toThrow("Docker Desktop");
  expect(calls).toEqual([["info", "--format", "{{json .}}"]]);
});
it("refreshes a cached old default latest image, but reuses a cached local override", async () => {
  const calls: string[][] = [];
  let pulled = false;
  const e = dockerEngine(
    {
      exec: async (_file, args) => {
        calls.push([...args]);
        if (args[0] === "pull") {
          pulled = true;
          return { code: 0, stdout: "" };
        }
        if (args[0] === "image") return { code: 0, stdout: pulled ? "new-id" : "cached-1.5.1" };
        throw new Error("Unexpected image fixture command");
      },
    },
    AbortSignal.timeout(1000),
    {},
  );
  expect(await e.image("ghcr.io/gentbajko/slopify:latest")).toBe("new-id");
  expect(calls[0]).toEqual(["pull", "ghcr.io/gentbajko/slopify:latest"]);
  calls.length = 0;
  pulled = false;
  expect(await e.image("slopify:smoke")).toBe("cached-1.5.1");
  expect(calls.some((c) => c[0] === "pull")).toBe(false);
});
it("retries a timed-out Docker exec probe and passes the exact candidate version", async () => {
  let probes = 0;
  const e = dockerEngine(
    {
      exec: async (_file, args, signal) => {
        if (args[0] === "inspect") return { code: 0, stdout: "true" };
        expect(args.at(-1)).toBe("1.6.0");
        expect(args[4]).toContain("b.version!==expected");
        if (++probes === 1)
          return new Promise<{ code: number; stdout: string }>((_, reject) =>
            signal.addEventListener("abort", () => reject(new Error("probe deadline")), {
              once: true,
            }),
          );
        return { code: 0, stdout: "" };
      },
    },
    AbortSignal.timeout(6000),
    {},
  );
  await e.health("candidate-id", "a".repeat(64), "1.6.0");
  expect(probes).toBe(2);
}, 8000);
it("propagates outer cancellation instead of retrying it", async () => {
  const outer = new AbortController();
  let calls = 0;
  const e = dockerEngine(
    {
      exec: async () => {
        calls++;
        outer.abort();
        throw new Error("outer cancellation");
      },
    },
    outer.signal,
    {},
  );
  await expect(e.health("candidate-id", "a".repeat(64), "1.6.0")).rejects.toThrow(
    "outer cancellation",
  );
  expect(calls).toBe(1);
});
