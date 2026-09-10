import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { cliBinary, cliPathStatus, saveCliPath } from "./cli-paths.js";
import type { CliProbe } from "./cli-status.js";

const clock = fixedClock("2026-09-10T10:00:00.000Z");
const installed: CliProbe = async () => ({ ran: true, stdout: "1.2.3" });
const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});
function harness(probe: CliProbe = installed) {
  const db = openDb(":memory:");
  migrate(db, clock);
  cleanups.push(() => db.close());
  return { db, probe };
}
function executable(name = "my cli.exe"): string {
  const dir = mkdtempSync(join(tmpdir(), "slopify-cli-path-"));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, name);
  writeFileSync(path, "fixture", { mode: 0o700 });
  return path;
}

describe("CLI executable paths", () => {
  it("defaults all three providers to PATH and keeps keyed providers separate", () => {
    const { db } = harness();
    expect(cliPathStatus(db, "codex")).toEqual({ configured: null, command: "codex" });
    expect(cliBinary(db, "claude-code")).toBe("claude");
    expect(cliBinary(db, "gemini")).toBe("gemini");
    expect(() => cliBinary(db, "openrouter")).toThrow(/CLI/);
  });

  it("stores a trimmed executable with spaces and reads later saves on each lookup", async () => {
    const deps = harness();
    const path = executable();
    expect(await saveCliPath(deps, "gemini", `  ${path}  `)).toMatchObject({
      ok: true,
      status: {
        id: "gemini",
        cliPath: { configured: path, command: path },
        readiness: { installed: true, version: "1.2.3" },
      },
    });
    expect(cliBinary(deps.db, "gemini")).toBe(path);
    await saveCliPath(deps, "gemini", process.execPath);
    expect(cliBinary(deps.db, "gemini")).toBe(process.execPath);
    expect(cliBinary(deps.db, "codex")).toBe("codex");
  });

  it("reset succeeds even when PATH has no working binary", async () => {
    const deps = harness();
    await saveCliPath(deps, "codex", process.execPath);
    const result = await saveCliPath(
      { ...deps, probe: async () => ({ ran: false, stdout: "" }) },
      "codex",
      "   ",
    );
    expect(result).toMatchObject({
      ok: true,
      status: { cliPath: { configured: null, command: "codex" }, readiness: { installed: false } },
    });
    expect(cliBinary(deps.db, "codex")).toBe("codex");
  });

  it.each(["codex --help", "./codex", "x".repeat(4097), "/tmp/cli\u0000name"])(
    "rejects invalid path %s without replacing the old value",
    async (path) => {
      const deps = harness();
      await saveCliPath(deps, "codex", process.execPath);
      expect((await saveCliPath(deps, "codex", path)).ok).toBe(false);
      expect(cliBinary(deps.db, "codex")).toBe(process.execPath);
    },
  );

  it("rejects directories, missing files, and command arguments", async () => {
    const deps = harness();
    for (const path of [
      tmpdir(),
      join(tmpdir(), "slopify-no-such-cli"),
      `${process.execPath} --version`,
    ]) {
      expect((await saveCliPath(deps, "codex", path)).ok).toBe(false);
    }
    expect(cliBinary(deps.db, "codex")).toBe("codex");
  });

  it.skipIf(process.platform === "win32")(
    "rejects a file without executable permission",
    async () => {
      const deps = harness();
      const path = executable();
      chmodSync(path, 0o600);
      expect((await saveCliPath(deps, "codex", path)).ok).toBe(false);
    },
  );

  it("accepts a readable JavaScript entry file without executable permission", async () => {
    const deps = harness();
    const path = executable("cli.mjs");
    chmodSync(path, 0o600);
    expect((await saveCliPath(deps, "gemini", path)).ok).toBe(true);
    expect(cliBinary(deps.db, "gemini")).toBe(path);
  });

  it("refuses keyed providers and unsuccessful probes without writing settings", async () => {
    const deps = harness(async () => ({ ran: false, stdout: "" }));
    expect((await saveCliPath(deps, "openrouter", process.execPath)).ok).toBe(false);
    expect(await saveCliPath(deps, "claude-code", process.execPath)).toMatchObject({
      ok: false,
      message: expect.stringMatching(/--version/),
    });
    expect(deps.db.prepare("SELECT count(*) AS n FROM settings").get()).toEqual({ n: 0 });
  });
  it("serializes overlapping saves so a late probe cannot overwrite a newer reset", async () => {
    let release: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    const deps = harness(async () => {
      if (first) {
        first = false;
        await started;
      }
      return { ran: true, stdout: "1.2.3" };
    });
    const saving = saveCliPath(deps, "codex", process.execPath);
    const resetting = saveCliPath(deps, "codex", "");
    release?.();
    expect((await saving).ok).toBe(true);
    expect((await resetting).ok).toBe(true);
    expect(cliBinary(deps.db, "codex")).toBe("codex");
  });

  it("reports a launcher-specific probe error without persisting the candidate", async () => {
    const message = "Unsupported batch launcher; select the JavaScript entry file.";
    const deps = harness(async () => ({ ran: false, stdout: "", error: message }));
    expect(await saveCliPath(deps, "gemini", process.execPath)).toEqual({ ok: false, message });
  });
});
