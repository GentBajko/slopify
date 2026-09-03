import type { RunConfig } from "@app/slices/admission/model.js";
import type { ProviderStatus } from "@app/slices/settings/model.js";
import { describe, expect, it } from "vitest";
import { providerFor, unreadyFor } from "./readiness.js";

const config = {
  llm: { provider: "claude-code", model: "sonnet" },
  audio: { provider: "elevenlabs", model: "v3", voice: "narrator" },
  images: { provider: "fal", model: "flux" },
} as unknown as RunConfig;

const keyed = (id: string, hasKey: boolean): ProviderStatus =>
  ({
    id,
    family: "image",
    displayName: id,
    readiness: { kind: "keyed", hasKey },
  }) as unknown as ProviderStatus;

const cli = (id: string, installed: boolean): ProviderStatus =>
  ({
    id,
    family: "llm",
    displayName: id,
    readiness: { kind: "cli", installed },
  }) as unknown as ProviderStatus;

describe("which provider a stage's retry would go to", () => {
  it("sends research and the article to the LLM, audio to the voice, both image stages to the image provider", () => {
    expect(providerFor("research", config)).toBe("claude-code");
    expect(providerFor("article", config)).toBe("claude-code");
    expect(providerFor("audio", config)).toBe("elevenlabs");
    expect(providerFor("images", config)).toBe("fal");
    expect(providerFor("thumbnail", config)).toBe("fal");
  });

  it("sends the video nowhere, because the render is local", () => {
    expect(providerFor("video", config)).toBeUndefined();
  });
});

describe("a stage whose provider is not ready", () => {
  it("says which of the two is missing", () => {
    expect(unreadyFor("images", config, [keyed("fal", false)])?.label).toBe("Key missing");
    expect(unreadyFor("article", config, [cli("claude-code", false)])?.label).toBe("CLI missing");
  });

  it("says nothing when the key is stored or the binary answers", () => {
    expect(unreadyFor("images", config, [keyed("fal", true)])).toBeUndefined();
    expect(unreadyFor("article", config, [cli("claude-code", true)])).toBeUndefined();
  });

  it("says nothing for a stage with no provider at all", () => {
    expect(unreadyFor("video", config, [keyed("fal", false)])).toBeUndefined();
  });

  it("says nothing about a provider this build no longer lists", () => {
    expect(unreadyFor("images", config, [])).toBeUndefined();
  });

  it("says nothing when the run never recorded a provider", () => {
    expect(unreadyFor("audio", {} as unknown as RunConfig, [keyed("fal", false)])).toBeUndefined();
  });
});
