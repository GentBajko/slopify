import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { ProviderChoice, RunDraft, VoiceChoice } from "../admission/model.js";
import { titleMax } from "../admission/rules.js";
import type { LoudnessSettings } from "../loudness/model.js";
import { defaultSentencePauseSeconds } from "../narration/pauses-model.js";
import { type ProviderStatus, systemVoiceProvider, type Voice } from "../settings/model.js";
import type { PackPromptKey, StarterPack } from "./packs.js";

// "Make a 60-second short": a topic in, a short-mode project out (`admission/short-mode.ts`),
// with the providers picked for the user from what this machine has: an installed CLI for the
// text and, with Codex, the images, so no key is needed for those; a keyed voice for the
// narration when one is set up, else the computer's built-in voice. What is missing is said
// with the screen that fixes it.

export interface ShortProviders {
  readonly llm: ProviderChoice;
  readonly audio: VoiceChoice;
  readonly images: ProviderChoice;
}

export interface ShortGap {
  readonly need: "text" | "voice" | "images";
  readonly message: string;
}

export type ShortPlan =
  | {
      readonly ok: true;
      readonly providers: ShortProviders;
      // The narration is the computer's own voice, found rather than saved.
      readonly systemVoice: boolean;
    }
  | { readonly ok: false; readonly gaps: readonly ShortGap[] };

export type ModelsFor = (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;

const textClis = ["claude-code", "codex", "gemini"] as const;
const keyedImages = ["openai-image", "google-image", "fal", "replicate"] as const;
const keyedVoices = ["openai-tts", "elevenlabs", "cartesia", "inworld"] as const;
// The first model of these providers is the one a first short uses, unless one of these is
// listed: a fast, capable default rather than the slowest or the smallest.
const preferred: Readonly<Record<string, RegExp>> = {
  "claude-code": /sonnet/i,
  "openai-tts": /^gpt-4o-mini-tts$/,
};

function ready(status: ProviderStatus | undefined): boolean {
  return status !== undefined && readinessIsUsable(status.readiness);
}

// The computer's own voice a first short falls back to: the best speech program found and its
// English voice (`kernel/system-speech.ts`), named as Settings → Voices will list it.
export interface SystemVoicePick {
  readonly model: string;
  readonly voiceId: string;
  readonly name: string;
}

async function firstModel(
  modelsFor: ModelsFor,
  provider: string,
  family: ProviderFamily,
): Promise<string | undefined> {
  let models: readonly ModelInfo[];
  try {
    models = await modelsFor(provider, family);
  } catch {
    return undefined;
  }
  const liked = preferred[provider];
  return (
    (liked === undefined ? undefined : models.find((model) => liked.test(model.id)))?.id ??
    models[0]?.id
  );
}

export async function planShortProviders(input: {
  readonly statuses: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly modelsFor: ModelsFor;
  // The voice the pack (or the starter set) suggests, used with an OpenAI key when no voice
  // of a keyed provider is saved.
  readonly suggested: StarterPack["voice"];
  // The built-in voice found on this computer, used when no keyed voice is ready.
  readonly systemVoice?: SystemVoicePick | undefined;
}): Promise<ShortPlan> {
  const status = (id: string) => input.statuses.find((row) => row.id === id);
  const gaps: ShortGap[] = [];

  let llm: ProviderChoice | undefined;
  for (const id of [...textClis, "openrouter"]) {
    if (!ready(status(id))) continue;
    const model = await firstModel(input.modelsFor, id, "llm");
    if (model !== undefined) {
      llm = { provider: id, model };
      break;
    }
  }
  if (llm === undefined)
    gaps.push({
      need: "text",
      message:
        "No text model is ready. Install Claude Code, Codex or Gemini CLI and sign in to it (Settings → Providers shows what Slopify found), or add an OpenRouter key in Settings → Providers.",
    });

  let images: ProviderChoice | undefined;
  for (const id of ["codex-image", ...keyedImages]) {
    if (!ready(status(id))) continue;
    const model = await firstModel(input.modelsFor, id, "image");
    if (model !== undefined) {
      images = { provider: id, model };
      break;
    }
  }
  if (images === undefined)
    gaps.push({
      need: "images",
      message:
        "No image model is ready. Install Codex CLI and sign in to it, or add an OpenAI, Google, fal.ai or Replicate key in Settings → Providers.",
    });

  // A keyed voice first (a saved one, else the pack's suggestion), then the computer's own: a
  // saved system voice, else the one found. Keys are the better voice, never a requirement.
  let audio: VoiceChoice | undefined;
  const keyed = (provider: string) => provider !== systemVoiceProvider;
  const saved = input.voices.find(
    (voice) => keyed(voice.provider) && ready(status(voice.provider)),
  );
  const provider =
    saved?.provider ??
    (ready(status(input.suggested.provider)) ? input.suggested.provider : undefined);
  if (provider !== undefined) {
    const model = await firstModel(input.modelsFor, provider, "tts");
    if (model !== undefined)
      audio = { provider, model, voice: saved?.voiceId ?? input.suggested.voiceId };
  }
  let systemVoice = false;
  const system = status(systemVoiceProvider);
  if (audio === undefined && ready(system) && input.systemVoice !== undefined) {
    const savedSystem = input.voices.find((voice) => voice.provider === systemVoiceProvider);
    audio = {
      provider: systemVoiceProvider,
      model: input.systemVoice.model,
      voice: savedSystem?.voiceId ?? input.systemVoice.voiceId,
    };
    systemVoice = true;
  }
  if (audio === undefined) {
    const systemIssue =
      system?.readiness.kind === "local" && system.readiness.issue !== undefined
        ? ` ${system.readiness.issue}`
        : "";
    gaps.push({
      need: "voice",
      message: keyedVoices.some((id) => ready(status(id)))
        ? "Your voice provider has no saved voice yet. Add one in Settings → Voices, then try again."
        : `No voice is ready to narrate the short: no voice key is saved and this computer's built-in voice can't be used.${systemIssue || " Install espeak-ng, or add an OpenAI, ElevenLabs, Cartesia or Inworld key in Settings → Providers (with ElevenLabs, Cartesia or Inworld, also save a voice in Settings → Voices)."}`,
    });
  }

  return llm === undefined || images === undefined || audio === undefined
    ? { ok: false, gaps }
    : { ok: true, providers: { llm, audio, images }, systemVoice };
}

// The short-mode draft for a topic, using the pack's (or starter set's) script and scene
// prompts under the names they have in the library.
export function shortDraft(input: {
  readonly topic: string;
  readonly pack: StarterPack;
  readonly names: Readonly<Partial<Record<PackPromptKey, string>>>;
  readonly providers: ShortProviders;
  // Settings → General's Level the volume, as a new run gets it.
  readonly loudness?: LoudnessSettings | undefined;
}): RunDraft {
  const topic = input.topic.trim().replace(/\s+/g, " ");
  const title = `${topic.charAt(0).toUpperCase()}${topic.slice(1)}`.slice(0, titleMax);
  const { style } = input.pack;
  return {
    mode: "short",
    title,
    format: "9:16",
    sources: {
      research: "off",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "off",
      video: "generate",
      document: "off",
    },
    llm: input.providers.llm,
    audio: input.providers.audio,
    images: input.providers.images,
    articlePrompt: input.names.shortScript ?? "",
    imagePrompts: [{ name: input.names.image ?? "", number: shortImages }],
    values: { topic },
    provided: {},
    silenceGapSeconds: 0.5,
    imageSeconds: shortImageSeconds,
    zoomPercent: style.zoomPercent,
    motionStyle: style.motionStyle,
    edgeSilenceSeconds: 0.5,
    ...(input.loudness === undefined ? {} : { loudness: input.loudness }),
    sentencePauseSeconds: defaultSentencePauseSeconds,
    subtitles: {
      mode: "off",
      language: "en",
      fontId: "default",
      fontSize: style.captions.fontSize,
      position: style.captions.position,
    },
  };
}

// Four images of fifteen seconds each: a minute of narration.
export const shortImages = 4;
export const shortImageSeconds = 15;
