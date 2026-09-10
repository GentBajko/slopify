import { describe, expect, it } from "vitest";
import { createModelCatalog } from "./models.js";

const first = [{ id: "first", name: "First model" }];
describe("model catalog", () => {
  it("coalesces requests, caches successful lists, and refreshes on request or expiry", async () => {
    let calls = 0;
    let now = 0;
    const catalog = createModelCatalog({
      load: async () => {
        calls++;
        return first;
      },
      fallback: () => [],
      now: () => now,
      report: () => {},
    });
    await Promise.all([catalog.get("codex", "llm"), catalog.get("codex", "llm")]);
    expect(calls).toBe(1);
    await catalog.get("codex", "llm");
    expect(calls).toBe(1);
    await catalog.get("codex", "llm", true);
    expect(calls).toBe(2);
    now = 300_001;
    await catalog.get("codex", "llm");
    expect(calls).toBe(3);
  });
  it("retains the last good list on failure without exposing the provider error", async () => {
    let failed = false;
    const reports: string[] = [];
    const catalog = createModelCatalog({
      load: async () => {
        if (failed) throw new Error("private provider response");
        return first;
      },
      fallback: () => [],
      now: () => 0,
      report: (id) => reports.push(id),
    });
    await catalog.get("elevenlabs", "tts");
    failed = true;
    const result = await catalog.get("elevenlabs", "tts", true);
    expect(result.models).toEqual(first);
    expect(result.warning).toContain("last loaded");
    expect(JSON.stringify(result)).not.toContain("private");
    expect(reports).toEqual(["elevenlabs"]);
  });
  it("uses bundled models on a first failure and invalidates them after settings change", async () => {
    let failed = true;
    const catalog = createModelCatalog({
      load: async () => {
        if (failed) throw new Error("unavailable");
        return first;
      },
      fallback: () => [{ id: "default", name: "Bundled model" }],
      now: () => 0,
      report: () => {},
    });
    expect((await catalog.get("gemini", "llm")).models[0]?.id).toBe("default");
    failed = false;
    catalog.invalidate("gemini");
    expect((await catalog.get("gemini", "llm")).models).toEqual(first);
  });
  it("does not let a request started before invalidation replace newer models", async () => {
    let finish = (_value: readonly { id: string; name: string }[]) => {};
    let calls = 0;
    const catalog = createModelCatalog({
      load: async () =>
        ++calls === 1
          ? new Promise((resolve) => {
              finish = resolve;
            })
          : first,
      fallback: () => [],
      now: () => 0,
      report: () => {},
    });
    const old = catalog.get("codex", "llm");
    catalog.invalidate("codex");
    await catalog.get("codex", "llm");
    finish([{ id: "old", name: "Old" }]);
    await old;
    expect((await catalog.get("codex", "llm")).models).toEqual(first);
  });
});
