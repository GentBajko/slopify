import type { ProviderStatus } from "@app/slices/settings/model.js";
import { describe, expect, it } from "vitest";
import { readinessLines } from "./settings-readiness";

const providers: readonly ProviderStatus[] = [
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    readiness: { kind: "cli", installed: true },
  },
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    readiness: { kind: "cli", installed: true },
  },
  {
    id: "openai-tts",
    family: "tts",
    displayName: "OpenAI",
    readiness: { kind: "keyed", hasKey: false },
  },
];

describe("the readiness lines", () => {
  it("names each part of a video by its stage, and what the video lacks without it", () => {
    const lines = readinessLines(providers);
    expect(lines.map((line) => [line.label, line.state])).toEqual([
      ["Article", "ready"],
      ["Narration", "no-key"],
      ["Images", "no-key"],
    ]);
    expect(lines[1]?.text).toBe("No voice service yet, so videos have no narration.");
    // A ready part has no button: its services are listed right under the lines.
    expect(lines.map((line) => line.action?.words)).toEqual([
      undefined,
      "Set up a voice service",
      "Set up an image service",
    ]);
  });

  it("names the tool Create picks first, once", () => {
    const [article] = readinessLines(providers, {
      llm: { provider: "claude-code", model: "sonnet" },
    });
    expect(article?.text).toBe("Claude Code CLI (Create picks it), Codex CLI");
  });

  it("leaves out a pick that is no longer usable", () => {
    const [article] = readinessLines(providers, { llm: { provider: "gemini", model: "x" } });
    expect(article?.text).toBe("Codex CLI, Claude Code CLI");
  });

  it("says Narration is ready only when a voice service can narrate, as the welcome does", () => {
    const eleven: ProviderStatus = {
      id: "elevenlabs",
      family: "tts",
      displayName: "ElevenLabs",
      readiness: { kind: "keyed", hasKey: true },
    };
    // A key alone does not narrate with ElevenLabs: a voice of its own must be saved.
    const [, keyOnly] = readinessLines([...providers, eleven]);
    expect(keyOnly).toMatchObject({
      state: "no-voice",
      text: "ElevenLabs has a key but no voice saved yet, so videos have no narration.",
      action: { kind: "voices", words: "Save a voice", provider: "elevenlabs" },
    });
    const [, withVoice] = readinessLines([...providers, eleven], undefined, [
      { id: "v1", provider: "elevenlabs", name: "Rachel", voiceId: "21m00" },
    ]);
    expect(withVoice).toMatchObject({ state: "ready", text: "ElevenLabs" });
    expect(withVoice?.action).toBeUndefined();
    // An OpenAI key narrates at once: the first short saves its voice.
    const openAi = providers.map((one) =>
      one.id === "openai-tts"
        ? { ...one, readiness: { kind: "keyed" as const, hasKey: true } }
        : one,
    );
    expect(readinessLines(openAi)[1]).toMatchObject({ state: "ready", text: "OpenAI" });
  });
});
