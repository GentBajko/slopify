import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { redact } from "../../kernel/log.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import { retryAfter } from "../retry-after.js";
import { inworldAsync } from "./inworld-async.js";
import { inworldTextParts } from "./inworld-text.js";

export const inworldModels: readonly ModelInfo[] = [
  { id: "inworld-tts-2", name: "Realtime TTS-2" },
  { id: "inworld-tts-2-flash", name: "Realtime TTS-2 Flash" },
];
interface InworldDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly key: () => string | undefined;
  readonly clock: Clock;
}
const envelope = z.object({
  result: z.object({ audioContent: z.string().optional() }).optional(),
  error: z.object({ code: z.number().optional(), message: z.string().optional() }).optional(),
});

export function inworldTts(deps: InworldDeps): TtsPort {
  return {
    id: "inworld",
    capabilities: { streams: true },
    models: async () => inworldModels,
    synthesize: async (request) => {
      const key = deps
        .key()
        ?.trim()
        .replace(/^Basic\s+/i, "");
      if (!key)
        throw providerError({ kind: "missing_key", message: "No Inworld API key is stored." });
      const cancel = new AbortController();
      const signal = AbortSignal.any([request.signal, cancel.signal]);
      const iterator = synthesizeParts(deps, { ...request, signal }, key);
      return {
        container: "mp3",
        audio: new ReadableStream<Uint8Array>(
          {
            async pull(controller) {
              try {
                const next = await iterator.next();
                if (next.done) controller.close();
                else controller.enqueue(next.value);
              } catch (error) {
                controller.error(error);
              }
            },
            async cancel() {
              cancel.abort();
              await iterator.return();
            },
          },
          { highWaterMark: 0 },
        ),
      };
    },
  };
}

async function* synthesizeParts(
  deps: InworldDeps,
  request: TtsRequest,
  key: string,
): AsyncGenerator<Uint8Array, void> {
  if ((request.model ?? "inworld-tts-2") === "inworld-tts-2" && request.text.length > 4000) {
    yield* inworldAsync(deps, request, key);
    return;
  }
  const parts = inworldTextParts(request.text);
  if (parts.length === 0)
    throw providerError({ kind: "unsupported", message: "Inworld needs text to narrate." });
  for (const text of parts) {
    request.signal.throwIfAborted();
    const response = await deps.fetch("https://api.inworld.ai/tts/v1/voice:stream", {
      method: "POST",
      redirect: "error",
      signal: request.signal,
      headers: { Authorization: `Basic ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        voiceId: request.voiceId,
        modelId: request.model ?? "inworld-tts-2",
        audioConfig: { audioEncoding: "MP3", sampleRateHertz: 48_000, bitRate: 128_000 },
      }),
    });
    if (!response.ok) {
      const detail = clean(await response.text().catch(() => ""), key);
      const retryAfterMs = retryAfter(response.headers.get("retry-after"));
      throw providerError({
        kind:
          response.status === 401 || response.status === 403
            ? "auth"
            : response.status === 429
              ? "rate_limit"
              : response.status === 400 || response.status === 404
                ? "unsupported"
                : "other",
        message: clean(
          `Inworld answered ${response.status} for voice ${request.voiceId}: ${detail || response.statusText}`,
          key,
        ),
        ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
      });
    }
    if (response.body === null) throw invalid("answered with no audio");
    let heard = false;
    for await (const line of lines(response.body)) {
      request.signal.throwIfAborted();
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        throw invalid("sent an unreadable audio chunk");
      }
      const parsed = envelope.safeParse(raw);
      if (!parsed.success || (!parsed.data.result && !parsed.data.error))
        throw invalid("sent an unreadable audio chunk");
      if (parsed.data.error) {
        const { code, message } = parsed.data.error;
        throw providerError({
          kind:
            code === 16 || code === 7
              ? "auth"
              : code === 8
                ? "rate_limit"
                : code === 3 || code === 5
                  ? "unsupported"
                  : "other",
          message: `Inworld stream failed: ${clean(message ?? "audio generation stopped", key)}`,
        });
      }
      const encoded = parsed.data.result?.audioContent;
      if (!encoded) continue;
      if (!/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1)
        throw invalid("sent invalid encoded audio");
      const audio = Buffer.from(encoded, "base64");
      if (audio.length === 0) continue;
      heard = true;
      yield audio;
    }
    if (!heard) throw invalid("answered with no audio");
  }
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string, void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      pending += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let end = pending.indexOf("\n");
      while (end !== -1) {
        if (end > 8 * 1024 * 1024) throw invalid("sent an oversized audio chunk");
        const line = pending.slice(0, end).trim();
        pending = pending.slice(end + 1);
        if (line) yield line;
        end = pending.indexOf("\n");
      }
      if (pending.length > 8 * 1024 * 1024) throw invalid("sent an oversized audio chunk");
      if (done) break;
    }
    if (pending.trim()) yield pending.trim();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
function clean(message: string, key: string): string {
  return redact(message.replaceAll(key, "[redacted]"));
}
function invalid(detail: string): Error {
  return providerError({ kind: "other", message: `Inworld ${detail}.` });
}
