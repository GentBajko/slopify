import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { diskSpaceAt, openRouterKeyLimit } from "./account-limits.js";

const answering = (status: number, body: unknown) => {
  const seen: { url: string; auth: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    seen.push({
      url: String(input),
      auth: new Headers(init?.headers).get("authorization"),
    });
    return new Response(JSON.stringify(body), { status });
  };
  return { seen, fetchImpl };
};

describe("openRouterKeyLimit", () => {
  it("reads the key's limit and what is left, with the key as a bearer token", async () => {
    const fake = answering(200, {
      data: { label: "sk-or…", limit: 100, limit_remaining: 74.5, usage: 25.5 },
    });
    expect(await openRouterKeyLimit(fake.fetchImpl, "k-test", AbortSignal.timeout(1000))).toEqual({
      limit: 100,
      remaining: 74.5,
    });
    expect(fake.seen).toEqual([{ url: "https://openrouter.ai/api/v1/key", auth: "Bearer k-test" }]);
  });

  it("reads a key with no limit as nothing to warn about", async () => {
    const fake = answering(200, { data: { limit: null, limit_remaining: null } });
    expect(await openRouterKeyLimit(fake.fetchImpl, "k", AbortSignal.timeout(1000))).toBeNull();
  });

  it("throws on a refusal or an answer it can't read, never with the key in it", async () => {
    const refused = answering(401, { error: { code: 401 } });
    await expect(
      openRouterKeyLimit(refused.fetchImpl, "k-secret", AbortSignal.timeout(1000)),
    ).rejects.toThrow("OpenRouter answered 401");
    const odd = answering(200, { nope: true });
    await expect(
      openRouterKeyLimit(odd.fetchImpl, "k-secret", AbortSignal.timeout(1000)),
    ).rejects.toThrow("OpenRouter's answer wasn't the key's limits");
  });
});

describe("diskSpaceAt", () => {
  it("reads the free and total space of the disk a folder is on", async () => {
    const space = await diskSpaceAt(tmpdir());
    expect(space.totalBytes).toBeGreaterThan(0);
    expect(space.freeBytes).toBeLessThanOrEqual(space.totalBytes);
  });
});
