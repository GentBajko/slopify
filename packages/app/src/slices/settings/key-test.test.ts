import { describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { KeyProbes } from "../../kernel/ports/key-probe.js";
import { keyGuides } from "./key-guides.js";
import { keyTestOutcome, testProviderKey } from "./key-test.js";
import { saveProviderKey } from "./keys.js";
import { type ProviderId, providers } from "./model.js";

const clock = fixedClock("2026-09-27T10:00:00.000Z");
const at = "2026-09-27T10:00:00.000Z";
// Stand-ins for adapters/key-probes.ts (tested beside it): same shape, no network.
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
const probes: KeyProbes = {
  replicate: { url: "https://api.replicate.com/v1/account", headers: bearer },
  "openai-tts": { url: "https://api.openai.com/v1/models", headers: bearer },
  "google-image": {
    url: "https://google.test/models",
    headers: (key) => ({ "x-goog-api-key": key }),
    badKey: (status, body) => status === 400 && body.includes("API_KEY_INVALID"),
  },
  inworld: {
    url: "https://inworld.test/voices",
    headers: (key) => ({ Authorization: `Basic ${key}` }),
    badKey: (status, body) => status === 403 && body.includes("does not exist"),
  },
  cartesia: { url: "https://cartesia.test/voices", headers: (key) => ({ "X-API-Key": key }) },
  fal: { url: "https://fal.test/pricing", headers: (key) => ({ Authorization: `Key ${key}` }) },
};
const keyed = providers.filter((provider) => provider.auth === "key").map((p) => p.id);

function harness(answer: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const db = openDb(":memory:");
  migrate(db, clock);
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), headers: { ...(init?.headers as Record<string, string>) } });
    return answer(String(input), init);
  }) as typeof globalThis.fetch;
  return { deps: { db, clock, fetch, probes }, calls };
}

describe("key setup guides", () => {
  it("has a guide and a harmless test call for every provider that takes a key", () => {
    for (const id of keyed) {
      expect(keyGuides[id]?.steps.length).toBeGreaterThan(1);
      expect(keyGuides[id]?.keyPage.url).toMatch(/^https:\/\//);
    }
  });
});

describe("the key Test button", () => {
  it("sends the saved key only to its own provider, and never echoes it", async () => {
    const { deps, calls } = harness(() => new Response("{}", { status: 200 }));
    saveProviderKey(deps, "replicate", "r8_secret");
    const outcome = await testProviderKey(deps, "replicate");
    expect(outcome).toEqual({
      provider: "replicate",
      result: "valid",
      ok: true,
      message: expect.stringContaining("Replicate accepted this key"),
      checkedAt: at,
    });
    expect(calls).toEqual([
      {
        url: "https://api.replicate.com/v1/account",
        headers: { Authorization: "Bearer r8_secret" },
      },
    ]);
    expect(JSON.stringify(outcome)).not.toContain("r8_secret");
  });

  it("tests a pasted key without saving it, ahead of the saved one", async () => {
    const { deps, calls } = harness(() => new Response("{}", { status: 200 }));
    saveProviderKey(deps, "replicate", "r8_saved");
    const outcome = await testProviderKey(deps, "replicate", "  r8_pasted \n");
    expect(outcome.ok).toBe(true);
    expect(outcome.message).toMatch(/not saved yet: choose Save to keep it/u);
    expect(calls[0]?.headers).toEqual({ Authorization: "Bearer r8_pasted" });
    expect(JSON.stringify(outcome)).not.toContain("r8_pasted");
    // Still the saved key: a test never stores what it tried.
    expect(
      deps.db.prepare("SELECT key FROM provider_keys WHERE provider='replicate'").get(),
    ).toEqual({
      key: "r8_saved",
    });
    const fresh = harness(() => new Response("{}", { status: 200 }));
    await testProviderKey(fresh.deps, "fal", "fal_pasted");
    expect(fresh.calls).toHaveLength(1);
    expect((await testProviderKey(fresh.deps, "fal")).result).toBe("no-key");
  });

  it("says there is no key without calling anyone", async () => {
    const { deps, calls } = harness(() => new Response("{}"));
    expect((await testProviderKey(deps, "fal")).result).toBe("no-key");
    expect(calls).toEqual([]);
  });

  it("maps a provider's odd bad-key answers from the body, not only the status", async () => {
    const cases: readonly [ProviderId, number, string][] = [
      ["google-image", 400, '{"error":{"details":[{"reason":"API_KEY_INVALID"}]}}'],
      ["inworld", 403, '{"code":7,"message":"API key does not exist or was deleted"}'],
      ["openai-tts", 401, '{"error":{"code":"invalid_api_key"}}'],
    ];
    for (const [provider, status, body] of cases) {
      const { deps } = harness(() => new Response(body, { status }));
      saveProviderKey(deps, provider, "k");
      const outcome = await testProviderKey(deps, provider);
      expect(outcome.result, provider).toBe("rejected");
      expect(outcome.message).toContain(keyGuides[provider]?.keyPage.url);
    }
  });

  it("turns every other answer into what failed, why and what to do", () => {
    const of = (status: number, body = "") => keyTestOutcome("openrouter", { status, body }, at);
    expect(of(402)).toMatchObject({
      result: "no-credit",
      ok: false,
      message: expect.stringContaining("https://openrouter.ai/settings/credits"),
    });
    expect(of(403)).toMatchObject({
      result: "forbidden",
      message: expect.stringContaining("HTTP 403"),
    });
    // A 400 without the provider's bad-key code is not called a bad key.
    expect(
      keyTestOutcome(
        "google-image",
        { status: 400, body: "FAILED_PRECONDITION" },
        at,
        probes["google-image"]?.badKey,
      ).result,
    ).toBe("unexpected");
    expect(of(429).result).toBe("rate-limited");
    expect(of(503).result).toBe("provider-down");
    expect(keyTestOutcome("fal", { failure: "timeout" }, at)).toMatchObject({
      result: "unreachable",
      message: expect.stringContaining("15 seconds"),
    });
  });

  it("reports a network failure as unreachable rather than a bad key", async () => {
    const { deps } = harness(() => {
      throw new TypeError("fetch failed");
    });
    saveProviderKey(deps, "cartesia", "k");
    expect(await testProviderKey(deps, "cartesia")).toMatchObject({
      result: "unreachable",
      message: expect.stringContaining("could not reach Cartesia"),
    });
  });
});
