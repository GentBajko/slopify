import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import { readinessIsUsable } from "../../kernel/ports/model.js";
import type { SpeechInstall } from "../../kernel/ports/system-speech.js";
import type { ProviderChoice, RunDraft, VoiceChoice } from "../admission/model.js";
import { titleMax } from "../admission/rules.js";
import type { LoudnessSettings } from "../loudness/model.js";
import { defaultSentencePauseSeconds } from "../narration/pauses-model.js";
import { type ProviderStatus, systemVoiceProvider, type Voice } from "../settings/model.js";
import type { FirstRunView, ShortGap } from "./model.js";
import type { PackPromptKey, StarterPack } from "./packs.js";

// "Make a 60-second short": a topic in, a short-mode project out (`admission/short-mode.ts`),
// with the providers picked for the user from what this machine has: an installed CLI for the
// text and, with Codex, the images, so no key is needed for those; a keyed voice for the
// narration when one is set up, else the computer's built-in voice. What is missing is said
// with what fixes it, in the same words the first-run checklist uses (`shortReadiness`).

export interface ShortProviders {
  readonly llm: ProviderChoice;
  readonly audio: VoiceChoice;
  readonly images: ProviderChoice;
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

// Who is asked first for each part: the CLIs before a key for the text, Codex before a key for
// the images.
const textOrder = ["claude-code", "codex", "gemini", "openrouter"] as const;
const imageOrder = ["codex-image", "openai-image", "google-image", "fal", "replicate"] as const;
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

const statusOf = (statuses: readonly ProviderStatus[]) => (id: string) =>
  statuses.find((row) => row.id === id);

// The keyed voice a first short narrates with: a saved voice of a voice service with a key,
// else the voice the pack suggests when its service has a key.
function keyedVoice(
  statuses: readonly ProviderStatus[],
  voices: readonly Voice[],
  suggested: StarterPack["voice"],
): { readonly provider: string; readonly voiceId: string } | undefined {
  const status = statusOf(statuses);
  const saved = voices.find(
    (voice) => voice.provider !== systemVoiceProvider && ready(status(voice.provider)),
  );
  if (saved !== undefined) return { provider: saved.provider, voiceId: saved.voiceId };
  return ready(status(suggested.provider))
    ? { provider: suggested.provider, voiceId: suggested.voiceId }
    : undefined;
}

// One gap per part nothing can do, in plain words with what fixes it. The voice names a voice
// service that has a key but no saved voice, since a key alone is not the fix then.
function gapOf(
  need: ShortGap["need"],
  statuses: readonly ProviderStatus[],
  install: SpeechInstall | undefined,
): ShortGap {
  if (need === "text")
    return {
      need,
      fix: "key",
      message:
        "Nothing can write the article yet. Sign in to Claude Code, Codex or Antigravity CLI on this computer, or add an OpenRouter key.",
    };
  if (need === "images")
    return {
      need,
      fix: "key",
      message:
        "Nothing can make the images yet. Add an image key (OpenAI, Google, fal.ai or Replicate), or sign in to Codex CLI on this computer.",
    };
  const status = statusOf(statuses);
  const unsaved = keyedVoices.map(status).find((row) => ready(row));
  if (unsaved !== undefined)
    return {
      need,
      fix: "saved-voice",
      message: `${unsaved.displayName} has a key but no voice saved yet. Save one in Settings → Voices, or add an OpenAI key, which works at once.`,
    };
  return {
    need,
    fix: "key",
    message:
      "Nothing can read the article aloud yet. Add a voice key: an OpenAI key works at once with the voices Slopify sets up.",
    ...(install === undefined ? {} : { install: { ...install, commands: [...install.commands] } }),
  };
}

// What a first short would use on this computer and what it lacks, without asking any provider
// for its models: the first-run checklist, which must agree with the refusal below.
export function shortReadiness(input: {
  readonly statuses: readonly ProviderStatus[];
  readonly voices: readonly Voice[];
  readonly suggested: StarterPack["voice"];
  readonly install?: SpeechInstall | undefined;
}): FirstRunView["needs"] {
  const status = statusOf(input.statuses);
  const part = (row: ProviderStatus | undefined) =>
    row === undefined
      ? { by: null, how: null }
      : ({ by: row.displayName, how: row.readiness.kind === "cli" ? "sign-in" : "key" } as const);
  const text = part(textOrder.map(status).find((row) => ready(row)));
  const images = part(imageOrder.map(status).find((row) => ready(row)));
  const keyed = keyedVoice(input.statuses, input.voices, input.suggested);
  const system = status(systemVoiceProvider)?.readiness;
  const voice =
    keyed !== undefined
      ? part(status(keyed.provider))
      : system?.kind === "local" && system.available
        ? ({ by: system.engine ?? "System voice", how: "computer" } as const)
        : { by: null, how: null };
  const gaps = (
    [
      ["text", text],
      ["images", images],
      ["voice", voice],
    ] as const
  )
    .filter(([, done]) => done.by === null)
    .map(([need]) => gapOf(need, input.statuses, input.install));
  return { text, voice, images, gaps };
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

// The first ready provider in `order` that lists a model.
async function firstReady(
  input: { readonly statuses: readonly ProviderStatus[]; readonly modelsFor: ModelsFor },
  order: readonly string[],
  family: ProviderFamily,
): Promise<ProviderChoice | undefined> {
  const status = statusOf(input.statuses);
  for (const id of order) {
    if (!ready(status(id))) continue;
    const model = await firstModel(input.modelsFor, id, family);
    if (model !== undefined) return { provider: id, model };
  }
  return undefined;
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
  // How to install the computer's voice here, said when nothing can narrate.
  readonly install?: SpeechInstall | undefined;
}): Promise<ShortPlan> {
  const status = statusOf(input.statuses);
  const llm = await firstReady(input, textOrder, "llm");
  const images = await firstReady(input, imageOrder, "image");

  // A keyed voice first (a saved one, else the pack's suggestion), then the computer's own: a
  // saved system voice, else the one found. Keys are the better voice, never a requirement.
  let audio: VoiceChoice | undefined;
  const keyed = keyedVoice(input.statuses, input.voices, input.suggested);
  if (keyed !== undefined) {
    const model = await firstModel(input.modelsFor, keyed.provider, "tts");
    if (model !== undefined) audio = { provider: keyed.provider, model, voice: keyed.voiceId };
  }
  let systemVoice = false;
  if (
    audio === undefined &&
    ready(status(systemVoiceProvider)) &&
    input.systemVoice !== undefined
  ) {
    const savedSystem = input.voices.find((voice) => voice.provider === systemVoiceProvider);
    audio = {
      provider: systemVoiceProvider,
      model: input.systemVoice.model,
      voice: savedSystem?.voiceId ?? input.systemVoice.voiceId,
    };
    systemVoice = true;
  }

  if (llm === undefined || images === undefined || audio === undefined)
    return {
      ok: false,
      gaps: [
        ...(llm === undefined ? [gapOf("text", input.statuses, input.install)] : []),
        ...(images === undefined ? [gapOf("images", input.statuses, input.install)] : []),
        ...(audio === undefined ? [gapOf("voice", input.statuses, input.install)] : []),
      ],
    };
  return { ok: true, providers: { llm, audio, images }, systemVoice };
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
    // {{Topic}} since 4.0; a pack installed before asks for {{topic}}, so both are filled.
    values: { Topic: topic, topic },
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
