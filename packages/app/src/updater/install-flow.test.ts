import { describe, expect, it } from "vitest";
import type { UpdateFlowDeps } from "./install-flow.js";
import { runUpdateFlow } from "./install-flow.js";
import type { UpdatePlan } from "./plan.js";
import { installArgs, restartArgs } from "./plan.js";

const plan: UpdatePlan = {
  token: "a".repeat(64),
  version: "0.6.2",
  previousVersion: "0.6.1",
  oldEntry: "/old/cli.js",
  dataDir: "/data with spaces",
  cwd: "/work",
  host: "127.0.0.1",
  port: 6969,
  npm: { file: "node", args: ["npm-cli.js"] },
};
function harness(failure?: "install" | "health") {
  const calls: string[] = [];
  const deps: UpdateFlowDeps = {
    install: async () => {
      calls.push("install");
      if (failure === "install") throw new Error("npm failed");
      return "/new/cli.js";
    },
    handoff: async () => {
      calls.push("handoff");
    },
    backup: async () => {
      calls.push("backup");
    },
    start: async (entry) => {
      calls.push(`start:${entry}`);
    },
    healthy: async (version) => {
      calls.push(`health:${version}`);
      if (failure === "health" && version === "0.6.2") throw new Error("boot failed");
    },
    stopCandidate: async () => {
      calls.push("stop");
    },
    restore: async () => {
      calls.push("restore");
    },
    activate: async () => {
      calls.push("activate");
    },
    release: async () => {},
    report: () => {},
  };
  return { calls, deps };
}
describe("update handoff", () => {
  it("installs and verifies first, backs up after shutdown, and activates only a healthy new server", async () => {
    const h = harness();
    await runUpdateFlow(plan, h.deps);
    expect(h.calls).toEqual([
      "install",
      "handoff",
      "backup",
      "start:/new/cli.js",
      "health:0.6.2",
      "activate",
    ]);
  });
  it("never stops the serving application after a failed npm install", async () => {
    const h = harness("install");
    await expect(runUpdateFlow(plan, h.deps)).rejects.toThrow();
    expect(h.calls).toEqual(["install"]);
  });
  it("restores the database and previous entry if the new release fails to boot", async () => {
    const h = harness("health");
    await expect(runUpdateFlow(plan, h.deps)).rejects.toThrow("restored");
    expect(h.calls).toEqual([
      "install",
      "handoff",
      "backup",
      "start:/new/cli.js",
      "health:0.6.2",
      "stop",
      "restore",
      "start:/old/cli.js",
      "health:0.6.1",
    ]);
  });
  it("restarts the original app without restoring a partial backup if copying fails", async () => {
    const h = harness();
    await expect(
      runUpdateFlow(plan, {
        ...h.deps,
        backup: async () => {
          throw new Error("disk full");
        },
      }),
    ).rejects.toThrow("restored");
    expect(h.calls).toEqual(["install", "handoff", "stop", "start:/old/cli.js", "health:0.6.1"]);
  });
  it("rolls back a healthy but still locked candidate if writing its activation pointer fails", async () => {
    const h = harness();
    let released = false;
    await expect(
      runUpdateFlow(plan, {
        ...h.deps,
        activate: async () => {
          throw new Error("disk full");
        },
        release: async () => {
          released = true;
        },
      }),
    ).rejects.toThrow("restored");
    expect(h.calls).toContain("health:0.6.2");
    expect(h.calls).toContain("restore");
    expect(released).toBe(false);
  });
  it("does not roll back committed data if unlocking or its acknowledgement fails", async () => {
    const h = harness();
    await expect(
      runUpdateFlow(plan, {
        ...h.deps,
        release: async () => {
          throw new Error("lost acknowledgement");
        },
      }),
    ).rejects.toThrow("lost acknowledgement");
    expect(h.calls).not.toContain("restore");
    expect(h.calls).not.toContain("stop");
    expect(h.calls).toContain("activate");
  });
  it("pins the trusted package and registry and passes startup values as literal arguments", () => {
    const args = installArgs("C:\\Users\\A & B\\updates", "0.6.2");
    expect(args).toContain("@gentbajko/slopify@0.6.2");
    expect(args).toContain("--@gentbajko:registry=https://registry.npmjs.org/");
    expect(args).not.toContain("-g");
    expect(restartArgs("C:\\Some & Path\\cli.js", plan)).toEqual([
      "C:\\Some & Path\\cli.js",
      "--host",
      "127.0.0.1",
      "--port",
      "6969",
      "--data-dir",
      "/data with spaces",
      "--no-open",
    ]);
    expect(() => installArgs("/tmp", "0.6.2;bad")).toThrow();
  });
});
