import { describe, expect, it } from "vitest";
import { isProviderError, providerError } from "./model.js";

describe("providerError", () => {
  it("is an Error carrying the provider's words verbatim", () => {
    const error = providerError({ kind: "refusal", message: "  I can't create that image. " });

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe("  I can't create that image. ");
    expect(error.fault.kind).toBe("refusal");
    expect(error.stack).toBeTypeOf("string");
  });

  it("carries a Retry-After only when the provider gave one", () => {
    expect(providerError({ kind: "rate_limit", message: "429" }).fault).not.toHaveProperty(
      "retryAfterMs",
    );
    expect(
      providerError({ kind: "rate_limit", message: "429", retryAfterMs: 5000 }).fault.retryAfterMs,
    ).toBe(5000);
  });
});

describe("isProviderError", () => {
  it("recognises one an adapter threw", () => {
    expect(isProviderError(providerError({ kind: "auth", message: "401" }))).toBe(true);
  });

  it("refuses anything else", () => {
    expect(isProviderError(new Error("socket hang up"))).toBe(false);
    expect(isProviderError("timeout")).toBe(false);
    expect(isProviderError(undefined)).toBe(false);
    expect(isProviderError(Object.assign(new Error("x"), { fault: { kind: "made up" } }))).toBe(
      false,
    );
  });
});
