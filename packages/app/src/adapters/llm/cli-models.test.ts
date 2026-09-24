import { chmod, mkdir, mkdtemp, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { nodeCodexModels } from "./codex-models.js";
import { nodeGeminiModels } from "./gemini-models.js";

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
        supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "max" }],
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
      { id: "future-model", name: "Future model", thinkingModes: ["low", "high"] },
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
      ).rejects.toThrow(/^Codex model metadata is unavailable\./);
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
  it("discovers the latest and base model constants used by Gemini CLI 0.61", async () => {
    const install = await geminiInstall(await directory());
    await writeFile(
      install.metadata,
      [
        'var BASE_GEMINI_FLASH_MODEL = "gemini-3.5-flash";',
        'var LATEST_GEMINI_FLASH_MODEL = "gemini-3.8-flash";',
        'var BASE_GEMINI_FLASH_LITE_MODEL = "gemini-3.1-flash-lite";',
        'var LATEST_GEMINI_FLASH_LITE_MODEL = "gemini-3.5-flash-lite";',
        "var DEFAULT_GEMINI_FLASH_MODEL = BASE_GEMINI_FLASH_MODEL;",
        "var DEFAULT_GEMINI_FLASH_LITE_MODEL = BASE_GEMINI_FLASH_LITE_MODEL;",
        'var PREVIEW_GEMINI_3_1_MODEL = "gemini-3.1-pro-preview";',
        'var SECONDARY_GEMINI_3_5_FLASH_MODEL = "gemini-3-flash";',
      ].join("\n"),
    );
    expect(await nodeGeminiModels(install.entry)).toEqual([
      { id: "auto", name: "Automatic (CLI default)" },
      { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", group: "Latest in installed CLI" },
      {
        id: "gemini-3.5-flash-lite",
        name: "Gemini 3.5 Flash-Lite",
        group: "Latest in installed CLI",
      },
      { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", group: "Other versions" },
      {
        id: "gemini-3.1-pro-preview",
        name: "Gemini 3.1 Pro (Preview)",
        group: "Latest in installed CLI",
      },
      { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash-Lite", group: "Other versions" },
    ]);
  });
  it("reads model constants from the installed CLI's bundled chunks", async () => {
    const root = await directory();
    const bundle = join(root, "node_modules/@google/gemini-cli/bundle");
    await mkdir(bundle, { recursive: true });
    const entry = join(bundle, "gemini.js");
    await writeFile(entry, 'import "./chunk-ABC123.js";\n');
    await writeFile(
      join(bundle, "chunk-ABC123.js"),
      [
        "// packages/core/dist/src/config/models.js",
        'var PREVIEW_GEMINI_MODEL = "gemini-3-pro-preview";',
        'var DEFAULT_GEMINI_MODEL = "gemini-2.5-pro";',
        'var DEFAULT_GEMINI_FLASH_MODEL = "gemini-2.5-flash";',
        'var DEFAULT_GEMINI_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";',
        'var PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL = "gemini-3.1-pro-preview-customtools";',
        'var SECONDARY_GEMINI_3_5_FLASH_MODEL = "gemini-3-flash";',
        'var GEMMA_4_31B_IT_MODEL = "gemma-4-31b-it";',
        'var DEFAULT_GEMINI_EMBEDDING_MODEL = "gemini-embedding-001";',
        '/* var DEFAULT_GEMINI_FAKE_MODEL = "gemini-fake"; */',
      ].join("\n"),
    );
    expect(await nodeGeminiModels(entry)).toEqual([
      { id: "auto", name: "Automatic (CLI default)" },
      {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro (Preview)",
        group: "Latest in installed CLI",
      },
      { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", group: "Other versions" },
      {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash-Lite",
        group: "Latest in installed CLI",
      },
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", group: "Latest in installed CLI" },
    ]);
  });
  it.each([false, true])(
    "reads literal model metadata in nested=%s package layout without execution",
    async (nested) => {
      const install = await geminiInstall(await directory(), nested);
      await writeFile(install.metadata, installedModels);
      expect(await nodeGeminiModels(install.entry)).toEqual([
        { id: "auto", name: "Automatic (CLI default)" },
        {
          id: "gemini-3.1-flash-preview",
          name: "Gemini 3.1 Flash (Preview)",
          group: "Latest in installed CLI",
        },
        { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", group: "Latest in installed CLI" },
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
      await writeFile(install.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-9-pro';");
      expect(await nodeGeminiModels("gemini")).toEqual([
        { id: "auto", name: "Automatic (CLI default)" },
        { id: "gemini-9-pro", name: "Gemini 9 Pro", group: "Latest in installed CLI" },
      ]);
    },
  );
  it("switches catalogues with the configured executable", async () => {
    const first = await geminiInstall(await directory());
    const second = await geminiInstall(await directory());
    await writeFile(first.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-8-pro';");
    await writeFile(second.metadata, "export const DEFAULT_GEMINI_MODEL = 'gemini-9-pro';");
    expect((await nodeGeminiModels(first.entry)).at(-1)?.id).toBe("gemini-8-pro");
    expect((await nodeGeminiModels(second.entry)).at(-1)?.id).toBe("gemini-9-pro");
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
