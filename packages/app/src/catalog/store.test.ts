import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createCatalogueStore, parseCatalogue } from "./store.js";

const bundled = readFileSync(new URL("../assets/models.yaml", import.meta.url), "utf8");
describe("model catalogue", () => {
  it("ships only valid families, a hard five-request ceiling, and current Gemini IDs", () => {
    const c = parseCatalogue(bundled);
    expect(c.llm.filter((m) => m.provider === "gemini").map((m) => m.id)).toEqual([
      "gemini-3.8-flash",
      "gemini-3.1-pro-preview",
    ]);
    expect(c.tts.find((m) => m.id === "inworld-tts-2")?.tts.maxCharacters).toBe(10000);
    expect(() => parseCatalogue(bundled.replace("maxConcurrent: 5", "maxConcurrent: 6"))).toThrow();
    expect(() => parseCatalogue(bundled.replace("provider: inworld", "provider: codex"))).toThrow();
  });
  it("creates an editable local file, reloads valid edits, and retains the last good catalogue", () => {
    const dataDir = mkdtempSync(join(tmpdir(), "slopify-models-"));
    const store = createCatalogueStore({ dataDir, bundled, fetch: globalThis.fetch });
    expect(readFileSync(store.status().path, "utf8")).toBe(bundled);
    writeFileSync(store.status().path, bundled.replace("Inworld TTS-2", "My account TTS-2"));
    expect(store.models("inworld", "tts")[0]?.name).toBe("My account TTS-2");
    writeFileSync(store.status().path, "llm: [broken");
    expect(store.models("inworld", "tts")[0]?.name).toBe("My account TTS-2");
    expect(store.status().warning).toMatch(/last valid/);
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
