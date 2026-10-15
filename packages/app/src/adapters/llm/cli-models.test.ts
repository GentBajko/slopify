import { mkdir, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeCodexModels } from "./codex-models.js";

const directories: string[] = [];
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(
    directories.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function directory(): Promise<string> {
  const result = await mkdtemp(join(tmpdir(), "slopify-cli-models-"));
  directories.push(result);
  return result;
}
async function cache(directory: string, models: readonly unknown[]): Promise<void> {
  await writeFile(join(directory, "models_cache.json"), JSON.stringify({ models }));
}

describe("Codex installed model catalogue", () => {
  it("reads visible CLI models, preserves CLI-only entries, and drops all unrelated metadata", async () => {
    const home = await directory();
    await cache(home, [
      {
        slug: "future-model",
        display_name: "Future model",
        visibility: "list",
        priority: 5,
        supported_reasoning_levels: [
          { effort: "low" },
          { effort: "high" },
          { effort: "max" },
          { effort: "ultra" },
          { effort: "turbo" },
        ],
        model_messages: "never returned",
      },
      { slug: "internal-review", visibility: "hide", priority: 0 },
      { slug: "cli-only", visibility: "list", priority: 1, supported_in_api: false },
      { slug: "future-model", display_name: "duplicate", visibility: "list", priority: 6 },
      { slug: "invalid id", visibility: "list" },
    ]);
    // Login and settings need not be readable or valid for model discovery.
    await mkdir(join(home, "auth.json"));
    await writeFile(join(home, "config.toml"), "not parsed");
    expect(await nodeCodexModels({ CODEX_HOME: home })).toEqual([
      { id: "cli-only", name: "cli-only" },
      // The CLI's own efforts, max and ultra included; one Slopify does not know is dropped.
      {
        id: "future-model",
        name: "Future model",
        thinkingModes: ["low", "high", "max", "ultra"],
      },
    ]);
  });
  it("reads updated metadata on the next refresh without a process restart", async () => {
    const home = await directory();
    await cache(home, [{ slug: "old", visibility: "list" }]);
    expect((await nodeCodexModels({ CODEX_HOME: home }))[0]?.id).toBe("old");
    await cache(home, [{ slug: "new", visibility: "list" }]);
    expect((await nodeCodexModels({ CODEX_HOME: home }))[0]?.id).toBe("new");
  });
  it.each(["missing", "malformed", "oversized", "empty", "directory"])(
    "reports %s metadata without leaking file contents or paths",
    async (kind) => {
      const home = await directory();
      const path = join(home, "models_cache.json");
      if (kind === "malformed") await writeFile(path, "secret-token-invalid-json");
      if (kind === "oversized") {
        await writeFile(path, "");
        await truncate(path, 8 * 1024 * 1024 + 1);
      }
      if (kind === "empty") await cache(home, [{ slug: "internal", visibility: "hide" }]);
      if (kind === "directory") await mkdir(path);
      await expect(
        nodeCodexModels({ CODEX_HOME: home }, join(home, "missing-codex")),
      ).rejects.toThrow(/^Slopify could not get the model list from the Codex CLI\./);
    },
  );
});
