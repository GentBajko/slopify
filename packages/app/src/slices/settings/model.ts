// The provider catalogue and the settings domain types.

import type { HostCliId } from "../../kernel/ports/host-cli.js";
import type { ProviderFamily, Readiness } from "../../kernel/ports/model.js";
import { defaultLoudness, type LoudnessDefault } from "../loudness/model.js";

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
  "gemini",
  "elevenlabs",
  "openai-tts",
  "cartesia",
  "inworld",
  "google-tts",
  "fal",
  "replicate",
  "openai-image",
  "google-image",
  "codex-image",
] as const;
export type ProviderId = (typeof providerIds)[number];

export function isLocalCliProvider(id: string): id is HostCliId {
  return id === "claude-code" || id === "codex" || id === "gemini" || id === "codex-image";
}

// How many calls to a command-line tool run at once. Each Codex image is its own job - its
// own folder and thread - so four are drawn side by side; the text CLIs keep three.
export function localCliConcurrency(id: HostCliId): number {
  return id === "codex-image" ? 4 : 3;
}

interface ProviderBase {
  readonly id: ProviderId;
  readonly family: ProviderFamily;
  readonly displayName: string;
}

export interface KeyedProvider extends ProviderBase {
  readonly auth: "key";
}

// A local agent CLI has no key: the CLI's own login is used, so readiness is whether the
// configured executable or PATH binary answers.
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
  {
    id: "gemini",
    family: "llm",
    displayName: "Gemini CLI",
    auth: "cli",
    binary: "gemini",
    versionArgs: ["--version"],
  },
  { id: "elevenlabs", family: "tts", displayName: "ElevenLabs", auth: "key" },
  { id: "openai-tts", family: "tts", displayName: "OpenAI", auth: "key" },
  { id: "cartesia", family: "tts", displayName: "Cartesia", auth: "key" },
  { id: "inworld", family: "tts", displayName: "Inworld", auth: "key" },
  { id: "google-tts", family: "tts", displayName: "Google Gemini", auth: "key" },
  { id: "fal", family: "image", displayName: "fal.ai", auth: "key" },
  { id: "replicate", family: "image", displayName: "Replicate", auth: "key" },
  { id: "openai-image", family: "image", displayName: "OpenAI", auth: "key" },
  { id: "google-image", family: "image", displayName: "Google", auth: "key" },
  {
    id: "codex-image",
    family: "image",
    displayName: "Codex CLI",
    auth: "cli",
    binary: "codex",
    versionArgs: ["--version"],
  },
];

// One Gemini API key pays for Google's speech and its images, so Gemini TTS uses the key saved
// for Google images until one of its own is saved.
export const sharedKeyOf: Readonly<Partial<Record<ProviderId, ProviderId>>> = {
  "google-tts": "google-image",
};

// The 30 prebuilt voices Gemini TTS speaks with (https://ai.google.dev/gemini-api/docs/speech-generation#voices),
// each with the style Google gives it. Settings → Voices offers them for Google Gemini.
export const geminiVoices: readonly { readonly name: string; readonly style: string }[] = [
  { name: "Zephyr", style: "Bright" },
  { name: "Puck", style: "Upbeat" },
  { name: "Charon", style: "Informative" },
  { name: "Kore", style: "Firm" },
  { name: "Fenrir", style: "Excitable" },
  { name: "Leda", style: "Youthful" },
  { name: "Orus", style: "Firm" },
  { name: "Aoede", style: "Breezy" },
  { name: "Callirrhoe", style: "Easy-going" },
  { name: "Autonoe", style: "Bright" },
  { name: "Enceladus", style: "Breathy" },
  { name: "Iapetus", style: "Clear" },
  { name: "Umbriel", style: "Easy-going" },
  { name: "Algieba", style: "Smooth" },
  { name: "Despina", style: "Smooth" },
  { name: "Erinome", style: "Clear" },
  { name: "Algenib", style: "Gravelly" },
  { name: "Rasalgethi", style: "Informative" },
  { name: "Laomedeia", style: "Upbeat" },
  { name: "Achernar", style: "Soft" },
  { name: "Alnilam", style: "Firm" },
  { name: "Schedar", style: "Even" },
  { name: "Gacrux", style: "Mature" },
  { name: "Pulcherrima", style: "Forward" },
  { name: "Achird", style: "Friendly" },
  { name: "Zubenelgenubi", style: "Casual" },
  { name: "Vindemiatrix", style: "Gentle" },
  { name: "Sadachbia", style: "Lively" },
  { name: "Sadaltager", style: "Knowledgeable" },
  { name: "Sulafat", style: "Warm" },
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
  readonly cliPath?: {
    readonly configured: string | null;
    readonly command: string;
    readonly managedOnHost?: boolean;
  };
}

export interface Voice {
  readonly id: string;
  readonly provider: ProviderId;
  readonly name: string;
  readonly voiceId: string;
  // The languages it speaks, as primary codes ("es"); absent is unknown, which Play offers for
  // every language (`slices/voices/languages.ts`).
  readonly languages?: readonly string[] | undefined;
  // Ticked in Settings → Voices for a voice cloned from, or made to sound like, a real person.
  // Narration in such a voice is YouTube's first AI use case (`slices/studio/disclosure.ts`).
  // Absent is off.
  readonly imitatesRealPerson?: true | undefined;
}

// The theme override the Appearance control writes.
export const appearances = ["system", "light", "dark"] as const;
export type Appearance = (typeof appearances)[number];

export interface AppSettings {
  // The silence beside a segment that exists, default 3 s.
  readonly silenceGapSeconds: number;
  readonly appearance: Appearance;
  // Level the volume for new runs: on at the recommended targets unless changed here
  // (`loudness/model.ts`). A project keeps what it was started with.
  readonly loudness: LoudnessDefault;
}

export const defaultSettings: AppSettings = {
  silenceGapSeconds: 3,
  appearance: "system",
  loudness: defaultLoudness,
};
