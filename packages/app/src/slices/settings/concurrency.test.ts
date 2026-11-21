import { describe, expect, it } from "vitest";
import { localCliConcurrency } from "./model.js";

describe("how many Codex images are drawn at once", () => {
  it("draws four by default and keeps three for the text tools", () => {
    expect(localCliConcurrency("codex-image", {})).toBe(4);
    expect(localCliConcurrency("claude-code", {})).toBe(3);
  });

  it("takes SLOPIFY_CODEX_IMAGES_AT_ONCE from 1 to 8", () => {
    expect(localCliConcurrency("codex-image", { SLOPIFY_CODEX_IMAGES_AT_ONCE: "6" })).toBe(6);
    expect(localCliConcurrency("codex-image", { SLOPIFY_CODEX_IMAGES_AT_ONCE: "1" })).toBe(1);
    expect(localCliConcurrency("claude-code", { SLOPIFY_CODEX_IMAGES_AT_ONCE: "6" })).toBe(3);
  });

  it("keeps four when the value is not a whole number from 1 to 8", () => {
    for (const value of ["0", "9", "2.5", "many", ""])
      expect(localCliConcurrency("codex-image", { SLOPIFY_CODEX_IMAGES_AT_ONCE: value })).toBe(4);
  });
});
