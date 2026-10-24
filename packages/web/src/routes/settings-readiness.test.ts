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
    expect(lines.map((line) => [line.label, line.ready])).toEqual([
      ["Article", true],
      ["Narration", false],
      ["Images", false],
    ]);
    expect(lines[1]?.text).toBe("No voice service yet, so videos have no narration.");
    expect(lines.map((line) => line.action)).toEqual([
      "Show writing services",
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
});
