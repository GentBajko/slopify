import { describe, expect, it } from "vitest";
import { fixFor, stageProvider } from "./rules.js";

// The sentences the adapters write (adapters/explain.ts, adapters/llm/cli-login-error.ts); a
// slice may not import an adapter, so they are quoted.
const signedOutCodex =
  'The Codex CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "codex login" and sign in, then use Retry stage.';
const signedOutClaude =
  'The Claude Code CLI is not signed in, or its sign-in has expired. Open a terminal on the computer running the CLI, run "claude auth login" and sign in, then use Retry stage.';
const rejectedKey =
  "ElevenLabs did not accept the API key (error 401). The key may be wrong, expired or revoked: paste a current key in Settings → Providers, then use Retry stage.";
const noKey =
  "No OpenRouter API key is saved. Add one in Settings → Providers, then use Retry stage.";
const refused = (provider: string): string =>
  `${provider} refused to make this image under its content rules. Reword the image prompt in the Images section of Edit project, or choose another image provider in its Providers section.`;

describe("fixFor", () => {
  it("offers to sign in to the CLI the failure names, with the command to run", () => {
    const reason = signedOutCodex;
    expect(fixFor({ stage: "article", kind: "missing_key", reason, provider: "codex" })).toEqual({
      kind: "sign-in",
      label: "Sign in to Codex",
      cli: "codex",
      command: "codex login",
    });
    expect(
      fixFor({ stage: "images", kind: "auth", reason: "401", provider: "codex-image" }),
    ).toMatchObject({ kind: "sign-in", command: "codex login" });
    expect(
      fixFor({
        stage: "research",
        reason: signedOutClaude,
      }),
    ).toMatchObject({ label: "Sign in to Claude Code", command: "claude auth login" });
  });

  it("sends a rejected or missing key to that provider's settings", () => {
    expect(
      fixFor({
        stage: "audio",
        kind: "auth",
        reason: rejectedKey,
        provider: "elevenlabs",
      }),
    ).toEqual({
      kind: "provider-settings",
      label: "Open Settings → Providers → ElevenLabs",
      provider: "elevenlabs",
    });
    expect(fixFor({ stage: "article", reason: noKey, provider: "openrouter" })).toMatchObject({
      kind: "provider-settings",
      label: "Open Settings → Providers → OpenRouter",
    });
  });

  it("opens the storage view when the disk is full", () => {
    expect(
      fixFor({ stage: "video", reason: "ffmpeg: write error: No space left on device" }),
    ).toEqual({ kind: "free-space", label: "Free space" });
    expect(
      fixFor({ stage: "audio", reason: "ENOSPC: no space left on device, write" }),
    ).toMatchObject({ kind: "free-space" });
  });

  it("offers to soften an image prompt a filter refused, and to edit any other", () => {
    expect(fixFor({ stage: "images", kind: "refusal", reason: refused("fal.ai") })).toEqual({
      kind: "refused",
      label: "Soften and retry",
      soften: true,
    });
    expect(fixFor({ stage: "thumbnail", reason: refused("OpenAI") })).toMatchObject({
      soften: true,
    });
    expect(fixFor({ stage: "article", kind: "refusal", reason: "I can't help with that" })).toEqual(
      { kind: "refused", label: "Edit prompt", soften: false },
    );
  });

  it("offers another model when the chosen one was retired", () => {
    for (const reason of [
      'OpenRouter rejected the request (error 404: "No endpoints found: the model gpt-3 is no longer available")',
      "The model `gemini-1.0-pro` does not exist or you do not have access to it.",
      "Unknown model: claude-2",
    ])
      expect(fixFor({ stage: "article", kind: "other", reason })).toEqual({
        kind: "switch-model",
        label: "Switch model",
      });
  });

  it("offers nothing for a failure it cannot name", () => {
    expect(fixFor({ stage: "video", reason: "ffmpeg exited with code 1" })).toBeUndefined();
    expect(fixFor({ stage: "images", kind: "rate_limit", reason: null })).toBeUndefined();
  });
});

describe("stageProvider", () => {
  it("reads the provider each stage calls from the project's choices", () => {
    const config = {
      llm: { provider: "openrouter" },
      audio: { provider: "elevenlabs" },
      images: { provider: "fal" },
    };
    expect(stageProvider(config, "article")).toBe("openrouter");
    expect(stageProvider(config, "audio")).toBe("elevenlabs");
    expect(stageProvider(config, "thumbnail")).toBe("fal");
    expect(stageProvider(config, "video")).toBeUndefined();
  });
});
