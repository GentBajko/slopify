import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogueStore, parseCatalogue } from "./store.js";

const bundled = readFileSync(new URL("../assets/models.yaml", import.meta.url), "utf8");
describe("model catalogue", () => {
  it("ships only API-backed models and a hard five-request ceiling", () => {
    const c = parseCatalogue(bundled);
    expect(c.llm.filter((m) => ["claude-code", "codex", "gemini"].includes(m.provider))).toEqual(
      [],
    );
    expect(c.tts.find((m) => m.id === "inworld-tts-2")?.tts.maxCharacters).toBe(10000);
    expect(() => parseCatalogue(bundled.replace("maxConcurrent: 5", "maxConcurrent: 6"))).toThrow();
    expect(() => parseCatalogue(bundled.replace("provider: inworld", "provider: codex"))).toThrow();
  });
  it("accepts an old private catalogue but makes its CLI rows inert", () => {
    const old = `schemaVersion: 1
updatedAt: 2026-09-24
providers:
  codex: { maxConcurrent: 5 }
  openrouter: { maxConcurrent: 3 }
llm:
  - provider: codex
    id: stale
    name: Stale
    source: https://example.com/old
    pricing: { inputPerMillionTokens: 999 }
    llm: { webSearch: true }
  - provider: openrouter
    id: api-model
    name: API Model
    source: https://example.com/api
    llm: { webSearch: false }
image: []
tts: []
`;
    const parsed = parseCatalogue(old);
    expect(parsed.llm.map((row) => row.id)).toEqual(["api-model"]);
    expect(parsed.providers).toEqual({ openrouter: { maxConcurrent: 3 } });
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-old-models-"));
    const store = createCatalogueStore({ dataDir, bundled: old, fetch: globalThis.fetch });
    expect(store.models("codex", "llm")).toEqual([]);
    expect(readFileSync(store.status().path, "utf8")).toBe(old);
  });
  it("creates an editable local file, reloads valid edits, and retains the last good catalogue", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-models-"));
    const store = createCatalogueStore({ dataDir, bundled, fetch: globalThis.fetch });
    expect(readFileSync(store.status().path, "utf8")).toBe(bundled);
    writeFileSync(store.status().path, bundled.replace("Inworld TTS-2", "My account TTS-2"));
    expect(store.models("inworld", "tts")[0]?.name).toBe("My account TTS-2");
    writeFileSync(store.status().path, "llm: [broken");
    expect(store.models("inworld", "tts")[0]?.name).toBe("My account TTS-2");
    expect(store.status().warning).toMatch(/last working/);
  });
  it("validates a downloaded update before replacing local settings and backs up successful updates", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-models-"));
    let body = "invalid";
    const store = createCatalogueStore({ dataDir, bundled, fetch: async () => new Response(body) });
    await expect(store.refresh()).rejects.toThrow();
    expect(readFileSync(store.status().path, "utf8")).toBe(bundled);
    body = bundled.replace("Inworld TTS-2", "Updated TTS-2");
    await store.refresh();
    expect(store.models("inworld", "tts")[0]?.name).toBe("Updated TTS-2");
    expect(readFileSync(`${store.status().path}.previous`, "utf8")).toBe(bundled);
  });
});
