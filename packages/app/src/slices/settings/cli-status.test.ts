import { describe, expect, it } from "vitest";
import type { CliProbe, CliProbeResult } from "./cli-status.js";
import { cliProbeTimeoutMs, cliReadiness, nodeCliProbe, versionFrom } from "./cli-status.js";
import type { CliProvider } from "./model.js";
import { providerById } from "./model.js";

// A binary name no machine has, so the "not found" branch is the same everywhere. The
// installed branch uses `node`, which is running this test.
const absentBinary = "slopify-no-such-binary-1a2b3c";

function cliProvider(id: "claude-code" | "codex"): CliProvider {
  const provider = providerById(id);
  if (provider.auth !== "cli") {
    throw new Error(`${id} is not a CLI provider`);
  }
  return provider;
}

describe("versionFrom", () => {
  it("reads the version out of what Claude Code prints", () => {
    expect(versionFrom("2.1.258 (Claude Code)\n")).toBe("2.1.258");
  });

  it("reads the version out of what Codex prints", () => {
    expect(versionFrom("codex-cli 0.149.1\n")).toBe("0.149.1");
  });

  it("takes a two-part version", () => {
    expect(versionFrom("v3.4\n")).toBe("3.4");
  });

  it("has no answer when the output carries no number", () => {
    expect(versionFrom("usage: claude [options]")).toBeUndefined();
  });

  it("has no answer for empty output", () => {
    expect(versionFrom("")).toBeUndefined();
  });
});

describe("cliReadiness", () => {
  it("reports a binary that answers as installed, with its version", async () => {
    const probe: CliProbe = () => Promise.resolve({ ran: true, stdout: "2.1.258 (Claude Code)" });

    expect(await cliReadiness(probe, cliProvider("claude-code"))).toEqual({
      kind: "cli",
      installed: true,
      version: "2.1.258",
    });
  });

  // Installed is what the lamp shows; the version is only the status line's detail.
  it("reports a binary that answers without a version as installed", async () => {
    const probe: CliProbe = () => Promise.resolve({ ran: true, stdout: "codex" });

    expect(await cliReadiness(probe, cliProvider("codex"))).toEqual({
      kind: "cli",
      installed: true,
    });
  });

  it("reports a binary that did not run as not installed", async () => {
    const probe: CliProbe = () => Promise.resolve({ ran: false, stdout: "" });

    expect(await cliReadiness(probe, cliProvider("codex"))).toEqual({
      kind: "cli",
      installed: false,
    });
  });

  it("asks for the provider's own binary and arguments, under the timeout", async () => {
    const calls: Array<{ binary: string; args: readonly string[]; timeoutMs: number }> = [];
    const probe: CliProbe = (binary, args, timeoutMs) => {
      calls.push({ binary, args, timeoutMs });
      return Promise.resolve({ ran: false, stdout: "" });
    };

    await cliReadiness(probe, cliProvider("claude-code"));

    expect(calls).toEqual([
      { binary: "claude", args: ["--version"], timeoutMs: cliProbeTimeoutMs },
    ]);
  });
});

describe("nodeCliProbe", () => {
  it("runs a binary that is on PATH and hands back its output", async () => {
    const result: CliProbeResult = await nodeCliProbe("node", ["--version"], cliProbeTimeoutMs);

    expect(result.ran).toBe(true);
    expect(versionFrom(result.stdout)).toBe(process.version.slice(1));
  });

  // Not found is an ordinary answer: the settings page renders "Not found on PATH".
  it("does not throw for a binary that is not on PATH", async () => {
    expect(await nodeCliProbe(absentBinary, ["--version"], cliProbeTimeoutMs)).toEqual({
      ran: false,
      stdout: "",
    });
  });

  it("treats a non-zero exit as not answering", async () => {
    expect(await nodeCliProbe("node", ["-e", "process.exit(1)"], cliProbeTimeoutMs)).toEqual({
      ran: false,
      stdout: "",
    });
  });

  // A hung binary may not wedge the settings page: the timeout kills it and the answer
  // is the same one an absent binary gives.
  it("gives up on a binary that never answers", async () => {
    const started = Date.now();

    const result = await nodeCliProbe("node", ["-e", "setTimeout(() => {}, 60000)"], 200);

    expect(result).toEqual({ ran: false, stdout: "" });
    expect(Date.now() - started).toBeLessThan(10_000);
  });

  it("passes an argument that would be a shell metacharacter through untouched", async () => {
    const result = await nodeCliProbe(
      "node",
      ["-e", "console.log('a; echo b')"],
      cliProbeTimeoutMs,
    );

    expect(result).toEqual({ ran: true, stdout: "a; echo b\n" });
  });
});
