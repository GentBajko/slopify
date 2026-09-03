// The provider catalogue and the settings domain types.

import type { ProviderFamily, Readiness } from "../../kernel/ports/model.js";

export type { ProviderFamily } from "../../kernel/ports/model.js";
// The three families are the three ports, so the set is named beside them.
export { providerFamilies } from "../../kernel/ports/model.js";

// The supported set. OpenAI ships two adapters with two ids, one per family:
// `provider_keys.provider` is the primary key, and a row per family is what lets a user key TTS
// without keying image generation.
export const providerIds = [
  "openrouter",
  "claude-code",
  "codex",
  "elevenlabs",
  "openai-tts",
  "cartesia",
  "fal",
  "replicate",
  "openai-image",
  "google-image",
] as const;
export type ProviderId = (typeof providerIds)[number];

interface ProviderBase {
  readonly id: ProviderId;
  readonly family: ProviderFamily;
  readonly displayName: string;
}

export interface KeyedProvider extends ProviderBase {
  readonly auth: "key";
}

// A local agent CLI has no key: the CLI's own login is used, so readiness is whether the
// binary answers on PATH.
export interface CliProvider extends ProviderBase {
  readonly auth: "cli";
  readonly binary: string;
  readonly versionArgs: readonly string[];
}

export type Provider = KeyedProvider | CliProvider;

export const providers: readonly Provider[] = [
  { id: "openrouter", family: "llm", displayName: "OpenRouter", auth: "key" },
  {
    id: "claude-code",
    family: "llm",
    displayName: "Claude Code CLI",
    auth: "cli",
    binary: "claude",
    versionArgs: ["--version"],
  },
  {
    id: "codex",
    family: "llm",
    displayName: "Codex CLI",
    auth: "cli",
    binary: "codex",
    versionArgs: ["--version"],
  },
  { id: "elevenlabs", family: "tts", displayName: "ElevenLabs", auth: "key" },
  { id: "openai-tts", family: "tts", displayName: "OpenAI", auth: "key" },
  { id: "cartesia", family: "tts", displayName: "Cartesia", auth: "key" },
  { id: "fal", family: "image", displayName: "fal.ai", auth: "key" },
  { id: "replicate", family: "image", displayName: "Replicate", auth: "key" },
  { id: "openai-image", family: "image", displayName: "OpenAI", auth: "key" },
  { id: "google-image", family: "image", displayName: "Google", auth: "key" },
];

export function providerById(id: ProviderId): Provider {
  const found = providers.find((provider) => provider.id === id);
  if (found === undefined) {
    // Unreachable while ProviderId is derived from the catalogue; a new id added to one
    // and not the other is a bug, not a user error.
    throw new Error(`the provider catalogue has no entry for ${id}`);
  }
  return found;
}

// The registry lists a provider's readiness, so the type is the kernel's.
export type { Readiness } from "../../kernel/ports/model.js";

export interface ProviderStatus {
  readonly id: ProviderId;
  readonly family: ProviderFamily;
  readonly displayName: string;
  readonly readiness: Readiness;
}

export interface Voice {
  readonly id: string;
  readonly provider: ProviderId;
  readonly name: string;
  readonly voiceId: string;
}

// The theme override the Appearance control writes.
export const appearances = ["system", "light", "dark"] as const;
export type Appearance = (typeof appearances)[number];

export interface AppSettings {
  // The silence beside a segment that exists, default 3 s.
  readonly silenceGapSeconds: number;
  readonly appearance: Appearance;
}

export const defaultSettings: AppSettings = { silenceGapSeconds: 3, appearance: "system" };
