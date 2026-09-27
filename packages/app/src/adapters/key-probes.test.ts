import { describe, expect, it } from "vitest";
import { keyProbes } from "./key-probes.js";

describe("key test calls", () => {
  it("covers every provider that takes a key, over HTTPS", () => {
    expect(Object.keys(keyProbes).sort()).toEqual(
      [
        "cartesia",
        "elevenlabs",
        "fal",
        "google-image",
        "inworld",
        "openai-image",
        "openai-tts",
        "openrouter",
        "replicate",
      ].sort(),
    );
    for (const probe of Object.values(keyProbes)) expect(probe.url).toMatch(/^https:\/\//);
  });

  it("recognises the bad-key answers that are not 401", () => {
    expect(keyProbes["google-image"]?.badKey?.(400, '{"reason":"API_KEY_INVALID"}')).toBe(true);
    expect(keyProbes["google-image"]?.badKey?.(400, "FAILED_PRECONDITION")).toBe(false);
    expect(keyProbes.elevenlabs?.badKey?.(400, '{"detail":{"code":"invalid_api_key"}}')).toBe(true);
    expect(
      keyProbes.inworld?.badKey?.(403, '{"message":"API key does not exist or was deleted"}'),
    ).toBe(true);
    expect(keyProbes.inworld?.badKey?.(403, '{"message":"permission denied"}')).toBe(false);
    expect(keyProbes.fal?.headers("k")).toEqual({ Authorization: "Key k" });
  });
});
