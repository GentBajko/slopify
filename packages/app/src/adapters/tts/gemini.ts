import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { DialogueLine, TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import {
  httpFailure,
  internalError,
  missingKey,
  noAudio,
  providerSaid,
  refreshList,
  unreadable,
  voiceFix,
} from "../explain.js";
import { retryAfter } from "../retry-after.js";

// The HTTP gateway adapter for Gemini's speech generation (generateContent with an AUDIO
// response, https://ai.google.dev/gemini-api/docs/speech-generation), billed to a Gemini API
// key. One voice is `speechConfig.voiceConfig`; a conversation of exactly two voices is
// `speechConfig.multiSpeakerVoiceConfig`, Gemini's native two-speaker narration. The answer is
// raw 16-bit mono PCM (24 kHz), which the port cannot carry, so it is encoded to MP3 by the
// injected encoder before it is handed back.

export const geminiTtsBase = "https://generativelanguage.googleapis.com/v1beta";
export const geminiTtsModel = "gemini-2.5-flash-preview-tts";
// Offline choices only; the picker normally loads the provider catalogue.
export const geminiTtsModels: readonly ModelInfo[] = [
  { id: "gemini-3.1-flash-tts-preview", name: "Gemini 3.1 Flash TTS (preview)" },
  { id: "gemini-2.5-flash-preview-tts", name: "Gemini 2.5 Flash TTS (preview)" },
  { id: "gemini-2.5-pro-preview-tts", name: "Gemini 2.5 Pro TTS (preview)" },
];
// multiSpeakerVoiceConfig takes exactly two speakers.
export const geminiDialogueVoices = 2;
const defaultSampleRate = 24_000;

// Encodes 16-bit little-endian mono PCM to MP3. Injected: the composition root owns ffmpeg.
export type PcmToMp3 = (
  pcm: Uint8Array,
  sampleRate: number,
  signal: AbortSignal,
) => Promise<Uint8Array>;

export interface GeminiTtsDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
  readonly key: () => string | undefined;
  readonly toMp3: PcmToMp3;
}

const inlineData = z.object({ mimeType: z.string().nullish(), data: z.string().nullish() });
const answer = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({ parts: z.array(z.object({ inlineData: inlineData.nullish() })).nullish() })
          .nullish(),
        finishReason: z.string().nullish(),
      }),
    )
    .nullish(),
  promptFeedback: z.object({ blockReason: z.string().nullish() }).nullish(),
});
const modelList = z.object({
  models: z
    .array(
      z.object({
        name: z.string(),
        displayName: z.string().nullish(),
        supportedGenerationMethods: z.array(z.string()).nullish(),
      }),
    )
    .nullish(),
});
const errorBody = z.object({
  error: z.object({ message: z.string().nullish(), status: z.string().nullish() }),
});

export function geminiTts(deps: GeminiTtsDeps): TtsPort {
  return {
    id: "google-tts",
    capabilities: { streams: false, dialogue: true },
    models: async (): Promise<readonly ModelInfo[]> => {
      const response = await deps.fetch(`${geminiTtsBase}/models?pageSize=1000`, {
        headers: { "x-goog-api-key": keyOf(deps) },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw await failure(response, undefined, refreshList);
      const parsed = modelList.safeParse(safeJson(await response.text()));
      if (!parsed.success) throw providerError({ kind: "other", message: unreadable("Google") });
      return (parsed.data.models ?? [])
        .filter(
          (model) =>
            /-tts\b|tts-/.test(model.name) &&
            (model.supportedGenerationMethods ?? ["generateContent"]).includes("generateContent"),
        )
        .map((model) => {
          const id = model.name.replace(/^models\//, "");
          return { id, name: model.displayName || id };
        });
    },
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const model = req.model ?? geminiTtsModel;
      const response = await deps.fetch(
        `${geminiTtsBase}/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          signal: req.signal,
          // The key rides Google's own header rather than the query string, which would put it
          // in every proxy log on the way.
          headers: { "x-goog-api-key": keyOf(deps), "Content-Type": "application/json" },
          body: JSON.stringify(geminiSpeechBody(req)),
        },
      );
      if (!response.ok) throw await failure(response, req.voiceId);
      const { pcm, sampleRate } = audioOf(await response.text());
      const mp3 = await deps.toMp3(pcm, sampleRate, req.signal);
      return { audio: streamOf(mp3), container: "mp3" };
    },
  };
}

// The request body. A dialogue of two voices names each voice as its speaker, since the
// transcript's speaker names must match `speakerVoiceConfigs`; a dialogue whose lines all share
// one voice is that voice reading the lines. More than two voices is a grouping bug upstream.
export function geminiSpeechBody(req: Pick<TtsRequest, "voiceId" | "text" | "dialogue">): unknown {
  const voices = [...new Set((req.dialogue ?? []).map((line) => line.voiceId))];
  if (voices.length > geminiDialogueVoices)
    throw providerError({
      kind: "unsupported",
      message: internalError(
        `a Gemini narration request had ${String(voices.length)} voices; Gemini takes at most two`,
      ),
    });
  const prebuilt = (voiceName: string) => ({ prebuiltVoiceConfig: { voiceName } });
  const two = req.dialogue !== undefined && voices.length === geminiDialogueVoices;
  const text =
    req.dialogue === undefined
      ? req.text
      : two
        ? conversation(req.dialogue, voices)
        : req.dialogue.map((line) => line.text).join("\n");
  return {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: two
        ? {
            multiSpeakerVoiceConfig: {
              speakerVoiceConfigs: voices.map((voice) => ({
                speaker: voice,
                voiceConfig: prebuilt(voice),
              })),
            },
          }
        : { voiceConfig: prebuilt(req.dialogue?.[0]?.voiceId ?? req.voiceId) },
    },
  };
}

function conversation(lines: readonly DialogueLine[], voices: readonly string[]): string {
  return [
    `TTS the following conversation between ${voices.join(" and ")}:`,
    ...lines.map((line) => `${line.voiceId}: ${line.text.replace(/\s*\n\s*/g, " ")}`),
  ].join("\n");
}

function audioOf(text: string): { readonly pcm: Uint8Array; readonly sampleRate: number } {
  const parsed = answer.safeParse(safeJson(text));
  if (!parsed.success) throw providerError({ kind: "other", message: unreadable("Google") });
  const blocked = parsed.data.promptFeedback?.blockReason;
  if (blocked)
    throw providerError({
      kind: "refusal",
      message: providerSaid(
        "Google",
        "refused to speak this narration under its content rules",
        blocked,
        "Reword that part of the script or article, or choose another voice provider under Speakers (Edit project → Providers).",
      ),
    });
  for (const candidate of parsed.data.candidates ?? [])
    for (const part of candidate.content?.parts ?? []) {
      const data = part.inlineData?.data;
      if (data) {
        const rate = /rate=(\d+)/.exec(part.inlineData?.mimeType ?? "")?.[1];
        return {
          pcm: new Uint8Array(Buffer.from(data, "base64")),
          sampleRate: rate === undefined ? defaultSampleRate : Number(rate),
        };
      }
    }
  throw providerError({ kind: "other", message: noAudio("Google") });
}

function streamOf(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function keyOf(deps: GeminiTtsDeps): string {
  // `missing_key`, not `auth`, because that rule makes it terminal.
  const key = deps.key();
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: missingKey("Google") });
  }
  return key;
}

function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "dropped";
  return "other";
}

async function failure(response: Response, voiceId?: string, next?: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // Through the redactor: an error body may quote the key back.
  const detail = redact(
    (parsed.success ? parsed.data.error.message : undefined) ??
      (text.trim() || response.statusText),
  );
  // Google answers an unknown key with 400 API_KEY_INVALID rather than 401.
  const badKey = response.status === 400 && text.includes("API_KEY_INVALID");
  const status = badKey ? 401 : response.status;
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: badKey ? "auth" : kindOf(response.status),
    message: httpFailure({
      provider: "Google",
      status,
      detail,
      next,
      ...(voiceId === undefined
        ? {}
        : { subject: `narration request for voice "${voiceId}"`, fix: voiceFix(voiceId) }),
    }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
