import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { ModelInfo, ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import { retryAfter } from "../retry-after.js";

// The HTTP gateway adapter for OpenAI's speech endpoint. `fetch` and nothing else; the response
// body is already the stream the port asks for.

export const openAiAudioBase = "https://api.openai.com/v1";
// Older callers can omit a model; saved project choices always supply one.
export const openAiTtsModel = "gpt-4o-mini-tts";
export const openAiTtsModels: readonly ModelInfo[] = [
  { id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS" },
  { id: "gpt-4o-mini-tts-2025-12-15", name: "GPT-4o mini TTS (2025-12-15)" },
  { id: "tts-1", name: "TTS-1" },
  { id: "tts-1-hd", name: "TTS-1 HD" },
];

export interface OpenAiTtsDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
  readonly key: () => string | undefined;
}

const modelList = z.object({ data: z.array(z.object({ id: z.string().min(1) })) });
// /models has no capability metadata. Only the speech endpoint's documented model families
// and dated snapshots belong here; realtime and transcription models use different APIs.
const speechModel = /^(?:tts-1(?:-hd)?(?:-\d{4})?|gpt-4o-mini-tts(?:-\d{4}-\d{2}-\d{2})?)$/;

const errorBody = z.object({
  error: z.object({ message: z.string(), code: z.string().nullish() }),
});

// A voice the user cloned is addressed as an object rather than by name: the request
// schema takes either a built-in name (`alloy`, `nova`, ...) or `{ id: "voice_1234" }`,
// and a custom id sent as a bare string is refused. The prefix is what tells them apart.
const customVoice = /^voice_/;

export function openAiTts(deps: OpenAiTtsDeps): TtsPort {
  return {
    id: "openai-tts",
    capabilities: { streams: true },
    models: async (): Promise<readonly ModelInfo[]> => {
      const response = await deps.fetch(`${openAiAudioBase}/models`, {
        headers: { Authorization: `Bearer ${keyOf(deps)}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw await failure(response);
      const parsed = modelList.safeParse(safeJson(await response.text()));
      if (!parsed.success) {
        throw providerError({
          kind: "other",
          message: "OpenAI's model list was not in the shape this app can read",
        });
      }
      return parsed.data.data
        .filter((model) => speechModel.test(model.id))
        .map((model) => ({ id: model.id, name: model.id }));
    },
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const response = await deps.fetch(`${openAiAudioBase}/audio/speech`, {
        method: "POST",
        signal: req.signal,
        headers: {
          Authorization: `Bearer ${keyOf(deps)}`,
          "Content-Type": "application/json",
        },
        // The 4096-character cap is not checked here. A longer text comes back as OpenAI's own
        // 400 and that is what the stage shows, so a user who chose Whole text learns the limit
        // from the provider that set it.
        body: JSON.stringify({
          model: req.model ?? openAiTtsModel,
          input: req.text,
          voice: voiceOf(req.voiceId),
          response_format: "mp3",
        }),
      });
      if (!response.ok) {
        throw await failure(response, req.voiceId);
      }
      if (response.body === null) {
        throw providerError({ kind: "other", message: "OpenAI answered with no audio" });
      }
      return { audio: response.body, container: "mp3" };
    },
  };
}

function voiceOf(voiceId: string): string | { readonly id: string } {
  return customVoice.test(voiceId) ? { id: voiceId } : voiceId;
}

function keyOf(deps: OpenAiTtsDeps): string {
  const key = deps.key();
  // An absent key is terminal, so it never becomes a request.
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no OpenAI key is stored" });
  }
  return key;
}

function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: as in the OpenRouter adapter, a 400 is retried three more times because the
  // port's error contract has no terminal kind for a request that cannot be repaired.
  return "other";
}

async function failure(response: Response, voiceId?: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  const parsed = errorBody.safeParse(safeJson(text));
  // Verbatim, through the same redactor the wrapper uses: OpenAI's own 401 quotes the
  // start of the key back at the caller.
  const message = redact(
    parsed.success ? parsed.data.error.message : text.trim() || response.statusText,
  );
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    // The voice ID is named, so a rejected voice reads differently from
    // a rejected key.
    message: `OpenAI answered ${response.status}${voiceId === undefined ? "" : ` for voice ${voiceId}`}: ${message}`,
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
