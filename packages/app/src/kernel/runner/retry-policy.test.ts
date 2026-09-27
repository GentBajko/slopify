import { describe, expect, it } from "vitest";
import { providerError, providerErrorKinds } from "../ports/model.js";
import {
  autoRetryBaseMs,
  autoRetryDelay,
  autoRetryLimit,
  faultOf,
  retryAfterCeilingMs,
  waitableKinds,
} from "./retry-policy.js";

const middle = (): number => 0.5;

describe("autoRetryDelay", () => {
  it("doubles the wait each time: about 2, 4, 8 and 16 minutes, then gives up", () => {
    const waits = [0, 1, 2, 3, 4].map((n) => autoRetryDelay({ kind: "rate_limit" }, n, middle));
    expect(waits).toEqual([...[2, 4, 8, 16].map((minutes) => minutes * 60_000), undefined]);
    expect(autoRetryLimit).toBe(4);
    // All four waits come to about half an hour.
    expect(waits.reduce((total: number, wait) => total + (wait ?? 0), 0)).toBe(30 * 60_000);
  });

  it("spreads the wait by a quarter either way", () => {
    expect(autoRetryDelay({ kind: "timeout" }, 0, () => 0)).toBe(autoRetryBaseMs * 0.75);
    expect(autoRetryDelay({ kind: "timeout" }, 0, () => 1)).toBe(autoRetryBaseMs * 1.25);
  });

  it("waits at least as long as the provider's Retry-After", () => {
    expect(autoRetryDelay({ kind: "rate_limit", retryAfterMs: 10 * 60_000 }, 0, middle)).toBe(
      10 * 60_000,
    );
    expect(autoRetryDelay({ kind: "rate_limit", retryAfterMs: 5_000 }, 0, middle)).toBe(
      autoRetryBaseMs,
    );
  });

  it("reports a quota that resets in hours instead of waiting on it", () => {
    expect(
      autoRetryDelay({ kind: "rate_limit", retryAfterMs: retryAfterCeilingMs + 1 }, 0, middle),
    ).toBeUndefined();
  });

  it("never waits on a refusal, a rejected key or an unsupported request", () => {
    for (const kind of providerErrorKinds.filter((one) => !waitableKinds.includes(one)))
      expect(autoRetryDelay({ kind }, 0, middle)).toBeUndefined();
    expect(waitableKinds).toEqual(["rate_limit", "timeout", "dropped"]);
    expect(autoRetryDelay(undefined, 0, middle)).toBeUndefined();
  });
});

describe("faultOf", () => {
  it("finds the provider's kind under the sentence a stage wrapped it in", () => {
    const wrapped = new Error("Image 3: limited", {
      cause: providerError({ kind: "rate_limit", message: "429", retryAfterMs: 1000 }),
    });
    expect(faultOf(wrapped)).toEqual({ kind: "rate_limit", retryAfterMs: 1000 });
    expect(faultOf(new Error("ffmpeg exited"))).toBeUndefined();
  });
});
