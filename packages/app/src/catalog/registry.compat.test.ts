import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { fixedClock } from "../kernel/clock.fake.js";
import { openDb } from "../kernel/db/index.js";
import { migrate } from "../kernel/db/migrate.js";
import type { LlmCompletion, LlmPort } from "../kernel/ports/llm.js";
import type { RunDraft } from "../slices/admission/model.js";
import { writeVerdict } from "../slices/model-checks/repo.js";
import { upsertKey } from "../slices/settings/repo.js";
import { curateRegistry } from "./registry.js";
import { createCatalogueStore } from "./store.js";
import { modelFields } from "./validate.js";

// Standings are for pickers only. A model marked "not on your plan" or "check failed" still
// runs exactly as before: the registry still calls the provider, validation still accepts it.
// A run that used to start must keep starting whatever a check concluded.

const src = fileURLToPath(new URL("..", import.meta.url));
const model = "google/gemini-3.8-flash";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
  });
}

describe("model standings never gate a run", () => {
  const catalogue = createCatalogueStore({
    dataDir: mkdtempSync(join(tmpdir(), "slopify-compat-")),
    fetch: () => Promise.reject(new Error("offline")),
  });
  const db = openDb(":memory:");
  const clock = fixedClock("2026-10-18T10:00:00.000Z");
  migrate(db, clock);
  upsertKey(db, "openrouter", "placeholder", "2026-10-18");
  const draft: RunDraft = {
    title: "Kept",
    format: "16:9",
    sources: {
      research: "off",
      article: "generate",
      audio: "off",
      images: "off",
      thumbnail: "off",
      video: "off",
    },
    llm: { provider: "openrouter", model },
    imagePrompts: [],
    values: {},
    provided: {},
    silenceGapSeconds: 0,
    imageSeconds: 15,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    edgeSilenceSeconds: 0,
  };

  it("validates and calls a model marked not on the plan exactly as before", async () => {
    const before = modelFields(draft, catalogue);
    for (const verdict of ["no-access", "failed"] as const)
      writeVerdict(db, {
        provider: "openrouter",
        family: "llm",
        model,
        account: "any",
        verdict,
        source: "check",
        sentence: "Not on your plan.",
        at: clock.now().toISOString(),
        cost: 0,
      });
    expect(modelFields(draft, catalogue)).toEqual(before);
    expect(before).toEqual([]);

    const requests: LlmCompletion[] = [];
    const port: LlmPort = {
      id: "openrouter",
      capabilities: { streams: true, webSearch: false, reportsUsage: false },
      models: async () => [],
      complete: async function* (request) {
        requests.push(request);
        yield { type: "done", usage: null, finishReason: null };
      },
    };
    const registry = curateRegistry(
      {
        list: async () => [],
        llm: () => port,
        tts: () => {
          throw new Error("no tts");
        },
        image: () => {
          throw new Error("no image");
        },
      },
      catalogue,
    );
    for await (const _event of registry.llm("openrouter").complete({
      model,
      messages: [],
      signal: new AbortController().signal,
    })) {
    }
    expect(requests.map((request) => request.model)).toEqual([model]);
  });

  // Only the edge (routes, MCP), the composition root and the slice itself may read standings;
  // nothing a run goes through may.
  it("is read by nothing a run goes through", () => {
    const allowed = [/^slices\/model-checks\//, /^edge\//, /^main\.ts$/, /^model-checks\.ts$/];
    const readers = files(src)
      .map((path) => relative(src, path).replaceAll("\\", "/"))
      .filter((path) => !allowed.some((rule) => rule.test(path)))
      .filter((path) => /slices\/model-checks\//.test(readFileSync(join(src, path), "utf8")));
    expect(readers).toEqual([]);
  });
});
