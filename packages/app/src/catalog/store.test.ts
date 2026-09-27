import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  catalogueSource,
  createCatalogueStore,
  openRouterModelsSource,
  parseCatalogue,
} from "./store.js";

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
  it("checks automatically by merging: retired models stay flagged, new ones appear, prices follow OpenRouter", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-models-sync-"));
    const published = bundled
      .replace("id: google/gemini-3.1-pro-preview", "id: google/gemini-3.2-pro")
      .replace("updatedAt: 2026-09-26", "updatedAt: 2026-09-30");
    const requested: string[] = [];
    const store = createCatalogueStore({
      dataDir,
      bundled,
      now: () => new Date("2026-10-01T00:00:00.000Z"),
      fetch: async (input) => {
        const url = String(input);
        requested.push(url);
        if (url === openRouterModelsSource)
          return Response.json({
            data: parseCatalogue(published)
              .llm.filter((row) => row.provider === "openrouter")
              .map((row) => ({
                id: row.id,
                pricing:
                  row.id === "google/gemini-3.8-flash"
                    ? { prompt: "0.000001", completion: "0.000005" }
                    : {
                        prompt: String((row.pricing.inputPerMillionTokens ?? 0) / 1e6),
                        completion: String((row.pricing.outputPerMillionTokens ?? 0) / 1e6),
                      },
              })),
          });
        return new Response(published);
      },
    });
    expect(store.syncDue?.(Date.parse("2026-10-01T00:00:00.000Z"))).toBe(true);
    const status = await store.sync?.();
    expect(requested).toEqual([catalogueSource, openRouterModelsSource]);
    expect(status?.warning).toBeNull();
    expect(status?.changes.added.map((row) => row.id)).toEqual(["google/gemini-3.2-pro"]);
    expect(status?.changes.retired.map((row) => row.id)).toEqual(["google/gemini-3.1-pro-preview"]);
    expect(status?.changes.priced.map((row) => row.id)).toEqual(["google/gemini-3.8-flash"]);
    const read = store.read();
    expect(read.llm.find((row) => row.id === "google/gemini-3.1-pro-preview")?.deprecated).toBe(
      true,
    );
    expect(read.llm.find((row) => row.id === "google/gemini-3.8-flash")?.pricing).toMatchObject({
      inputPerMillionTokens: 1,
      outputPerMillionTokens: 5,
    });
    // Pickers hide the retired model; the file keeps it so its uses can be listed.
    expect(store.models("openrouter", "llm").map((row) => row.id)).not.toContain(
      "google/gemini-3.1-pro-preview",
    );
    expect(readFileSync(`${store.status().path}.previous`, "utf8")).toBe(bundled);
    expect(store.status().sync?.checkedAt).toBe("2026-10-01T00:00:00.000Z");
    expect(store.syncDue?.(Date.parse("2026-10-01T12:00:00.000Z"))).toBe(false);
    expect(store.syncDue?.(Date.parse("2026-10-02T00:00:00.000Z"))).toBe(true);
  });
  it("keeps the current list and says why when the check cannot download or the local file is broken", async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-models-sync-fail-"));
    const store = createCatalogueStore({
      dataDir,
      bundled,
      fetch: async () => new Response("nope", { status: 503 }),
    });
    const status = await store.sync?.();
    expect(status?.warning).toMatch(/Check now in Settings → Models/);
    expect(status?.checkedAt).toBeNull();
    expect(readFileSync(store.status().path, "utf8")).toBe(bundled);
    writeFileSync(store.status().path, "llm: [broken");
    expect((await store.sync?.())?.warning).toMatch(/models.yaml file is missing or has a mistake/);
    expect(readFileSync(store.status().path, "utf8")).toBe("llm: [broken");
  });
});
