import { expect, it, vi } from "vitest";
import { dockerEngine } from "./engine.js";

it("labels a copy reader with its transaction at creation", async () => {
  const exec = vi.fn(async () => ({ code: 0, stdout: "reader-id" }));
  const e = dockerEngine({ exec }, new AbortController().signal, {});
  await e.copy("image-id", "selected", null, "/staging", "transaction-id");
  expect(exec.mock.calls[0]).toEqual([
    "docker",
    expect.arrayContaining([
      "create",
      "--name",
      "slopify-reader-transaction-id",
      "--label",
      "io.slopify.reader=transaction-id",
    ]),
    expect.any(AbortSignal),
  ]);
});

it("cleans up a canceled copy with an independent ten-second signal", async () => {
  const outer = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout");
  const signals: AbortSignal[] = [];
  const calls: string[][] = [];
  const e = dockerEngine(
    {
      exec: async (_file, args, signal) => {
        calls.push([...args]);
        if (args[0] === "create") return { code: 0, stdout: "reader-id" };
        if (args[0] === "cp") {
          outer.abort(new Error("copy canceled"));
          signal.throwIfAborted();
        }
        signals.push(signal);
        signal.throwIfAborted();
        return { code: 0, stdout: "" };
      },
    },
    outer.signal,
    {},
  );
  try {
    await expect(e.copy("image-id", "selected", null, "/staging", "id")).rejects.toThrow(
      "copy canceled",
    );
    expect(calls.at(-1)).toEqual(["rm", "reader-id"]);
    expect(signals).toHaveLength(1);
    expect(signals[0]).not.toBe(outer.signal);
    expect(signals[0]?.aborted).toBe(false);
    expect(timeout).toHaveBeenCalledWith(10_000);
  } finally {
    timeout.mockRestore();
  }
});

function claimFixture(rw = false) {
  const containers = [
    { id: "a".repeat(64), name: "historical", running: false, volume: "selected", rw },
    { id: "b".repeat(64), name: "current", running: true, volume: "selected", rw: true },
    { id: "c".repeat(64), name: "unrelated", running: false, volume: "other", rw: true },
  ];
  const calls: string[][] = [];
  const e = dockerEngine(
    {
      exec: async (file, args) => {
        calls.push([file, ...args]);
        if (args.join(" ") === "container ls -a -q")
          return { code: 0, stdout: containers.map((c) => c.id.slice(0, 12)).join("\n") };
        if (args.join(" ") === "container ls -q")
          return {
            code: 0,
            stdout: containers
              .filter((c) => c.running)
              .map((c) => c.id.slice(0, 12))
              .join("\n"),
          };
        if (args[0] === "container" && args[1] === "ls" && args[3] === "--filter")
          return { code: 0, stdout: "" };
        if (args[0] === "inspect") {
          const c = containers.find((c) => c.id.slice(0, 12) === args[1]);
          if (!c) throw new Error("Unknown fixture container");
          return {
            code: 0,
            stdout: JSON.stringify([
              {
                Id: c.id,
                Name: `/${c.name}`,
                Image: "sha256:fixture",
                Config: { User: "1001:1002", Labels: null },
                State: { Running: c.running },
                HostConfig: { RestartPolicy: { Name: "no", MaximumRetryCount: 0 } },
                Mounts: [
                  {
                    Type: "volume",
                    Name: c.volume,
                    Source: `/var/lib/docker/volumes/${c.volume}/_data`,
                    Destination: "/data",
                    RW: c.rw,
                  },
                ],
                NetworkSettings: { Ports: {} },
              },
            ]),
          };
        }
        throw new Error("Unexpected claim fixture command");
      },
    },
    AbortSignal.timeout(1000),
    {},
  );
  return { e, calls };
}

it.each([true, false])(
  "rejects a stopped foreign volume claimant with RW=%s using only reads",
  async (rw) => {
    const { e, calls } = claimFixture(rw);
    await expect(e.claims("selected", ["b".repeat(64)])).rejects.toThrow("historical");
    expect(calls).toEqual([
      ["docker", "container", "ls", "-a", "-q"],
      [
        "docker",
        "container",
        "ls",
        "-a",
        "--filter",
        `name=^/${"a".repeat(12)}$`,
        "--format",
        "{{.ID}}",
      ],
      ["docker", "inspect", "a".repeat(12)],
    ]);
  },
);

it("allows exact historical and current IDs while ignoring unrelated volumes", async () => {
  const { e, calls } = claimFixture();
  await expect(e.claims("selected", ["a".repeat(64), "b".repeat(64)])).resolves.toBeUndefined();
  expect(calls.filter((c) => c[1] === "inspect")).toEqual(
    ["a", "b", "c"].map((id) => ["docker", "inspect", id.repeat(12)]),
  );
});

it.each(["historical", "a".repeat(12)])(
  "refuses a claimant permitted only by name or short ID: %s",
  async (id) => {
    const { e } = claimFixture();
    await expect(e.claims("selected", [id, "b".repeat(64)])).rejects.toThrow("historical");
  },
);

it("rejects an unpermitted running claimant after a permitted historical one", async () => {
  const { e } = claimFixture();
  await expect(e.claims("selected", ["a".repeat(64)])).rejects.toThrow("current");
});

it("keeps writer inventory limited to running containers", async () => {
  const { e, calls } = claimFixture();
  await expect(e.writers("selected", [], ["b".repeat(64)])).resolves.toBeUndefined();
  expect(calls[0]).toEqual(["docker", "container", "ls", "-q"]);
  expect(calls.filter((c) => c[1] === "inspect")).toEqual([["docker", "inspect", "b".repeat(12)]]);
});

it("refuses to clear claims when an inventoried container cannot be inspected", async () => {
  const e = dockerEngine(
    {
      exec: async (_file, args) => {
        if (args.join(" ") === "container ls -a -q") return { code: 0, stdout: "a".repeat(12) };
        return { code: args[0] === "inspect" ? 1 : 0, stdout: "" };
      },
    },
    AbortSignal.timeout(1000),
    {},
  );
  await expect(e.claims("selected", [])).rejects.toThrow("Cannot verify volume claims");
});

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
