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

describe("live model lists", () => {
  const list = (id: string) => {
    const found = keyProbes[id]?.list;
    if (found === undefined) throw new Error(`${id} has no live list`);
    return found;
  };

  it("lists the providers that offer a models endpoint, and not the others", () => {
    expect(
      Object.entries(keyProbes)
        .filter(([, probe]) => probe.list !== undefined)
        .map(([id]) => id)
        .sort(),
    ).toEqual([
      "elevenlabs",
      "google-image",
      "google-tts",
      "openai-image",
      "openai-tts",
      "openrouter",
    ]);
  });

  it("reads OpenAI's and OpenRouter's data[].id", () => {
    expect(list("openai-tts").url(undefined)).toBe("https://api.openai.com/v1/models");
    expect(list("openai-image").read('{"data":[{"id":"gpt-image-1"},{"id":"tts-1"},{}]}')).toEqual({
      ids: ["gpt-image-1", "tts-1"],
    });
    expect(list("openrouter").read('{"data":[{"id":"x/y"}]}')).toEqual({ ids: ["x/y"] });
  });

  it("pages through Google's list without the models/ prefix", () => {
    const google = list("google-image");
    expect(google.url(undefined)).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
    );
    expect(google.url("tok en")).toBe(
      "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&pageToken=tok%20en",
    );
    expect(
      google.read(
        '{"models":[{"name":"models/imagen-4"},{"name":"models/gemini-tts"}],"nextPageToken":"n2"}',
      ),
    ).toEqual({ ids: ["imagen-4", "gemini-tts"], next: "n2" });
  });

  it("reads ElevenLabs' array of model_id", () => {
    expect(
      list("elevenlabs").read('[{"model_id":"eleven_v3"},{"model_id":"eleven_flash_v2_5"}]'),
    ).toEqual({
      ids: ["eleven_v3", "eleven_flash_v2_5"],
    });
  });

  it("answers undefined for a list it can't read", () => {
    expect(list("openai-tts").read("<html>")).toBeUndefined();
    expect(list("google-tts").read('{"models":"nope"}')).toBeUndefined();
    expect(list("elevenlabs").read('{"detail":"x"}')).toBeUndefined();
  });
});
