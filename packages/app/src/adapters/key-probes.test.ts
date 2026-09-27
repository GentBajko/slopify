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
        "google-tts",
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

  it("asks for a chosen model by its own page or finds it in the list", () => {
    expect(keyProbes["openai-image"]?.model?.url("gpt-image-2")).toBe(
      "https://api.openai.com/v1/models/gpt-image-2",
    );
    expect(keyProbes["google-image"]?.model?.url("models/gemini-3-pro-image")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image",
    );
    expect(keyProbes.replicate?.model?.url("black-forest-labs/flux-dev:abc")).toBe(
      "https://api.replicate.com/v1/models/black-forest-labs/flux-dev",
    );
    const listed = keyProbes.openrouter?.model?.lists;
    const list = JSON.stringify({ data: [{ id: "openai/gpt-5.6-sol" }] });
    expect(listed?.(list, "openai/gpt-5.6-sol")).toBe(true);
    expect(listed?.(list, "openai/gone")).toBe(false);
    expect(listed?.("not json", "openai/gpt-5.6-sol")).toBeUndefined();
    expect(
      keyProbes.elevenlabs?.model?.lists?.(
        JSON.stringify([{ model_id: "eleven_v3" }]),
        "eleven_v3",
      ),
    ).toBe(true);
    // No model read without generating: the health check says so rather than passing.
    expect(keyProbes.cartesia?.model).toBeUndefined();
  });
});
