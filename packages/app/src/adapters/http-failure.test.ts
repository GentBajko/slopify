import { describe, expect, it } from "vitest";
import type { ProviderError } from "../kernel/ports/model.js";
import { httpProviderError, kindOfStatus, requireKey, safeJson } from "./http-failure.js";

function faultOf(error: Error): ProviderError["fault"] | undefined {
  return (error as ProviderError).fault;
}

describe("the shared HTTP failure plumbing", () => {
  it("reads JSON or nothing", () => {
    expect(safeJson('{"a":1}')).toEqual({ a: 1 });
    expect(safeJson("<html>")).toBeUndefined();
  });

  it("names the kind from the status", () => {
    expect(kindOfStatus(401)).toBe("auth");
    expect(kindOfStatus(403)).toBe("auth");
    expect(kindOfStatus(429)).toBe("rate_limit");
    expect(kindOfStatus(503)).toBe("dropped");
    expect(kindOfStatus(422)).toBe("other");
  });

  it("refuses an absent key with the settings sentence", () => {
    expect(requireKey("k", "Acme")).toBe("k");
    for (const key of [undefined, ""]) {
      expect(() => requireKey(key, "Acme")).toThrow(/No Acme API key is saved/);
    }
  });

  it("carries Retry-After, else the provider's own hint", () => {
    const withHeader = new Response("", { headers: { "retry-after": "3" } });
    const error = httpProviderError(withHeader, "rate_limit", "slow down", 9000);
    const bare = httpProviderError(new Response(""), "rate_limit", "slow down", 9000);
    const none = httpProviderError(new Response(""), "other", "no");
    expect([error, bare, none].map((one) => faultOf(one)?.retryAfterMs)).toEqual([
      3000,
      9000,
      undefined,
    ]);
    expect(error.message).toBe("slow down");
  });
});
