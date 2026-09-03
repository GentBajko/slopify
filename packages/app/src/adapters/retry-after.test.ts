import { describe, expect, it } from "vitest";
import { retryAfter } from "./retry-after.js";

describe("retryAfter", () => {
  it("reads the seconds form", () => {
    expect(retryAfter("30")).toBe(30_000);
  });

  it("reads the HTTP-date form as the wait from now", () => {
    const at = new Date(Date.now() + 20_000).toUTCString();
    const waited = retryAfter(at) ?? 0;
    expect(waited).toBeGreaterThan(18_000);
    expect(waited).toBeLessThanOrEqual(21_000);
  });

  it("answers nothing for an absent or unreadable header", () => {
    expect(retryAfter(null)).toBeUndefined();
    expect(retryAfter("soon")).toBeUndefined();
  });

  it("never asks for a wait in the past", () => {
    expect(retryAfter(new Date(Date.now() - 60_000).toUTCString())).toBe(0);
  });
});
