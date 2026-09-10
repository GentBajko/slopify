import { chmod, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeCodexModels } from "./codex-models.js";
import { geminiModels, nodeGeminiModels } from "./gemini-models.js";

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
      { id: "future-model", name: "Future model" },
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
      await expect(nodeCodexModels({ CODEX_HOME: home })).rejects.toThrow(
        /^Codex model metadata is unavailable\./,
      );
    },
  );
});

async function geminiInstall(
  root: string,
  nested = false,
): Promise<{ entry: string; metadata: string }> {
  const scope = join(root, "node_modules/@google");
  const cli = join(scope, "gemini-cli");
  const entry = join(cli, "dist/index.js");
  const metadata = join(
    nested ? join(cli, "node_modules/@google") : scope,
    "gemini-cli-core/dist/src/config/models.js",
  );
  await mkdir(dirname(entry), { recursive: true });
  await mkdir(dirname(metadata), { recursive: true });
  await writeFile(entry, "throw new Error('discovery must never execute the CLI');");
  return { entry, metadata };
}
const installedModels = `
throw new Error('model metadata must not be imported');
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export let PREVIEW_GEMINI_FLASH_MODEL =
  'gemini-3.1-flash-preview';
export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';
export const PREVIEW_GEMINI_FLASH_LITE_MODEL = 'none';
export const UNRELATED_MODEL = 'gemini-unrelated';
/*
export const DEFAULT_GEMINI_FAKE_MODEL = 'gemini-comment';
*/
export const DEFAULT_GEMINI_DUPLICATE_MODEL = 'gemini-2.5-pro';
`;

describe("Gemini installed model catalogue", () => {
  it.each([false, true])(
    "reads literal model metadata in nested=%s package layout without execution",
    async (nested) => {
      const install = await geminiInstall(await directory(), nested);
      await writeFile(install.metadata, installedModels);
      expect(await nodeGeminiModels(install.entry)).toEqual([
        ...geminiModels,
        { id: "gemini-2.5-pro", name: "gemini-2.5-pro" },
        { id: "gemini-3.1-flash-preview", name: "gemini-3.1-flash-preview" },
      ]);
    },
  );
  it.skipIf(process.platform === "win32")(
    "follows a PATH symlink to its installed package and sees metadata updates",
    async () => {
      const root = await directory();
      const install = await geminiInstall(root);
      const bin = join(root, "bin");
      await mkdir(bin);
      await chmod(install.entry, 0o755);
      await symlink(install.entry, join(bin, "gemini"));
      vi.stubEnv("PATH", bin + delimiter + (process.env.PATH ?? ""));
      await writeFile(install.metadata, installedModels);
      expect(
        (await nodeGeminiModels("gemini")).some((model) => model.id === "gemini-2.5-pro"),
      ).toBe(true);
      await writeFile(install.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-new';");
      expect(await nodeGeminiModels("gemini")).toEqual([
        ...geminiModels,
        { id: "gemini-new", name: "gemini-new" },
      ]);
    },
  );
  it("switches catalogues with the configured executable", async () => {
    const first = await geminiInstall(await directory());
    const second = await geminiInstall(await directory());
    await writeFile(first.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-first';");
    await writeFile(second.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-second';");
    expect((await nodeGeminiModels(first.entry)).at(-1)?.id).toBe("gemini-first");
    expect((await nodeGeminiModels(second.entry)).at(-1)?.id).toBe("gemini-second");
  });
  it.each(["missing", "malformed", "oversized"])(
    "reports %s installed metadata so the API can mark the alias fallback",
    async (kind) => {
      const install = await geminiInstall(await directory());
      if (kind === "malformed")
        await writeFile(install.metadata, "secret token, no model constants");
      if (kind === "oversized") {
        await writeFile(install.metadata, "");
        await truncate(install.metadata, 256 * 1024 + 1);
      }
      await expect(nodeGeminiModels(install.entry)).rejects.toThrow(
        /^Gemini CLI model metadata is unavailable\./,
      );
    },
  );
});
