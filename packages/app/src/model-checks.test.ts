import { describe, expect, it } from "vitest";
import type { Catalogue } from "./catalog/schema.js";
import { manualClock } from "./kernel/clock.fake.js";
import type { LlmCompletion } from "./kernel/ports/llm.js";
import { providerError } from "./kernel/ports/model.js";
import type { Registry } from "./kernel/ports/registry.js";
import { modelChecker, type RecipeDeps, recipeFor } from "./model-checks.js";
import { catalogue as fixture } from "./slices/model-checks/catalogue.fake.js";

const catalogue: Catalogue = {
  ...fixture,
  llm: fixture.llm.map((row) =>
    row.id === "cheap"
      ? {
          ...row,
          llm: { ...row.llm, thinking: { high: { effort: "high" }, low: { effort: "low" } } },
        }
      : row,
  ),
};
const deps = (over: Partial<RecipeDeps> = {}): RecipeDeps => ({
  catalogue: () => catalogue,
  voices: () => [],
  cliModels: async () => [{ id: "gpt-5", name: "GPT-5", thinkingModes: ["medium", "off"] }],
  systemVoiceReady: async () => true,
  ...over,
});

describe("check recipes", () => {
  it("asks a text model for one word at its lowest thinking setting", async () => {
    expect(
      await recipeFor(deps(), { provider: "openrouter", family: "llm", model: "cheap" }),
    ).toEqual({
      kind: "call",
      call: {
        kind: "llm",
        provider: "openrouter",
        model: "cheap",
        prompt: "Reply with OK.",
        thinking: "low",
      },
    });
    expect(
      await recipeFor(deps(), { provider: "openrouter", family: "llm", model: "dear" }),
    ).toEqual({
      kind: "call",
      call: { kind: "llm", provider: "openrouter", model: "dear", prompt: "Reply with OK." },
    });
    expect(
      await recipeFor(deps(), { provider: "codex", family: "llm", model: "gpt-5" }),
    ).toMatchObject({
      call: { thinking: "off" },
    });
    const offline = deps({ cliModels: () => Promise.reject(new Error("gone")) });
    expect(await recipeFor(offline, { provider: "codex", family: "llm", model: "gpt-5" })).toEqual({
      kind: "call",
      call: { kind: "llm", provider: "codex", model: "gpt-5", prompt: "Reply with OK." },
    });
  });

  it("says Hi with a saved voice, else a default one, else asks for a voice", async () => {
    const saved = deps({
      voices: () => [{ id: "v", provider: "cartesia", name: "Mine", voiceId: "uuid-1" }],
    });
    expect(
      await recipeFor(saved, { provider: "cartesia", family: "tts", model: "sonic" }),
    ).toMatchObject({
      call: { kind: "tts", voiceId: "uuid-1", text: "Hi" },
    });
    expect(
      await recipeFor(deps(), { provider: "openai-tts", family: "tts", model: "t" }),
    ).toMatchObject({
      call: { voiceId: "alloy" },
    });
    expect(
      await recipeFor(deps(), { provider: "cartesia", family: "tts", model: "sonic" }),
    ).toMatchObject({
      kind: "skip",
      reason: expect.stringContaining("Settings → Voices"),
    });
  });

  it("counts the system voice as working when a speech program is there", async () => {
    const target = { provider: "system-voice", family: "tts", model: "say" } as const;
    expect(await recipeFor(deps(), target)).toEqual({ kind: "free-works" });
    expect(await recipeFor(deps({ systemVoiceReady: async () => false }), target)).toMatchObject({
      kind: "skip",
    });
  });

  it("draws a square grey dot, and never generates a clip", async () => {
    expect(await recipeFor(deps(), { provider: "fal", family: "image", model: "flux" })).toEqual({
      kind: "call",
      call: {
        kind: "image",
        provider: "fal",
        model: "flux",
        prompt: "a small grey dot",
        aspect: "1:1",
      },
    });
    expect(
      await recipeFor(deps(), { provider: "fal", family: "image", model: "clip" }),
    ).toMatchObject({
      kind: "skip",
    });
    expect(
      await recipeFor(
        deps({ cliModels: async () => [{ id: "gpt-5", name: "x", thinkingModes: ["low"] }] }),
        {
          provider: "codex-image",
          family: "image",
          model: "gpt-5",
        },
      ),
    ).toMatchObject({ call: { aspect: "1:1", thinking: "low" } });
  });
});

describe("modelChecker", () => {
  const registry = (fail: boolean, seen: LlmCompletion[] = []): Registry => ({
    llm: () => ({
      id: "openrouter",
      capabilities: { streams: true, reportsUsage: true, webSearch: false },
      models: async () => [],
      complete: async function* (request) {
        seen.push(request);
        if (fail)
          throw providerError({
            kind: "other",
            message: "No endpoints found.",
            access: "not-found",
          });
        yield { type: "delta", text: "OK" };
        yield { type: "done", usage: { inputTokens: 10, outputTokens: 1 }, finishReason: "stop" };
      },
    }),
    tts: () => {
      throw new Error("no tts");
    },
    image: () => {
      throw new Error("no image");
    },
    list: async () => [],
  });
  const signal = new AbortController().signal;
  const target = { provider: "openrouter", family: "llm", model: "cheap" } as const;

  it("checks, prices what it used, and passes the provider's refusal on", async () => {
    const base = { ...deps(), clock: manualClock(), log: { write: () => {} } };
    expect(await modelChecker({ ...base, registry: registry(false) })(target, signal)).toEqual({
      kind: "checked",
      verdict: "works",
      sentence: null,
      stopProvider: false,
      spent: (10 * 1 + 1 * 4) / 1e6,
    });
    expect(await modelChecker({ ...base, registry: registry(true) })(target, signal)).toMatchObject(
      {
        verdict: "no-access",
        spent: 0,
      },
    );
  });

  it("makes no call for a skipped recipe or the system voice", async () => {
    const seen: LlmCompletion[] = [];
    const base = {
      ...deps(),
      clock: manualClock(),
      log: { write: () => {} },
      registry: registry(false, seen),
    };
    expect(
      await modelChecker(base)({ provider: "fal", family: "image", model: "clip" }, signal),
    ).toMatchObject({
      kind: "skipped",
    });
    expect(
      await modelChecker(base)({ provider: "system-voice", family: "tts", model: "say" }, signal),
    ).toMatchObject({
      kind: "checked",
      verdict: "works",
      spent: 0,
    });
    expect(seen).toEqual([]);
  });
});
