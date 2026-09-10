import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { redact } from "../../kernel/log.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsRequest } from "../../kernel/ports/tts.js";
import { retryAfter } from "../retry-after.js";

interface AsyncDeps {
  readonly fetch: typeof globalThis.fetch;
  readonly clock: Clock;
}
const operationName =
  /^workspaces\/[A-Za-z0-9_-]+\/ttsAsyncJobs\/[A-Za-z0-9_-]+\/operations\/[A-Za-z0-9_-]+$/;
const operationSchema = z.object({
  name: z.string().regex(operationName),
  done: z.boolean().optional(),
  error: z.object({ code: z.number().optional(), message: z.string().optional() }).nullish(),
  response: z.object({ audioUri: z.string() }).nullish(),
});

// Async is documented for TTS-2 only. Flash continues using the streaming API.
// A continuation survives automatic retries of this call; pausing/restarting a
// stage stops local polling but cannot cancel an already accepted remote job.
export async function* inworldAsync(
  deps: AsyncDeps,
  request: TtsRequest,
  key: string,
): AsyncGenerator<Uint8Array, void> {
  if (request.text.length > 100_000) {
    throw providerError({
      kind: "unsupported",
      message:
        "Inworld async accepts up to 100,000 characters per request (10,000 for On-Demand accounts). Select paragraph chunking for longer articles.",
    });
  }
  const headers = { Authorization: `Basic ${key}`, "Content-Type": "application/json" };
  const saved = request.continuation?.read();
  if (saved && !operationName.test(saved)) throw invalid("returned an invalid operation name");
  request.signal.throwIfAborted();
  let response = await deps.fetch(
    saved
      ? `https://api.inworld.ai/lro/v1alpha/${saved}`
      : "https://api.inworld.ai/tts/v1/voice:synthesizeAsync",
    {
      method: saved ? "GET" : "POST",
      headers,
      signal: request.signal,
      redirect: "error",
      ...(saved
        ? {}
        : {
            body: JSON.stringify({
              text: request.text,
              voiceId: request.voiceId,
              modelId: request.model ?? "inworld-tts-2",
              audioConfig: { audioEncoding: "MP3", sampleRateHertz: 48_000, bitRate: 128_000 },
            }),
          }),
    },
  );
  let expected = saved;
  for (;;) {
    request.signal.throwIfAborted();
    await check(response, key);
    const parsed = operationSchema.safeParse(await response.json().catch(() => null));
    if (!parsed.success || (expected && parsed.data.name !== expected))
      throw invalid("returned an invalid operation");
    const operation = parsed.data;
    expected = operation.name;
    request.continuation?.write(operation.name);
    request.onActivity?.();
    request.signal.throwIfAborted();
    if (operation.done) {
      if (operation.error) {
        const { code, message } = operation.error;
        throw providerError({
          kind:
            code === 7 || code === 16
              ? "auth"
              : code === 8
                ? "rate_limit"
                : code === 3 || code === 5 || code === 9
                  ? "unsupported"
                  : "other",
          message: `Inworld async job failed: ${clean(message ?? "audio generation stopped", key)}`,
        });
      }
      if (!operation.response) throw invalid("finished without an audio download");
      yield* download(deps.fetch, operation.response.audioUri, request.signal);
      return;
    }
    await deps.clock.sleep(5000, request.signal);
    request.signal.throwIfAborted();
    response = await deps.fetch(`https://api.inworld.ai/lro/v1alpha/${operation.name}`, {
      headers,
      signal: request.signal,
      redirect: "error",
    });
  }
}

async function* download(
  fetch: typeof globalThis.fetch,
  uri: string,
  signal: AbortSignal,
): AsyncGenerator<Uint8Array, void> {
  const url = URL.parse(uri);
  if (url?.protocol !== "https:" || url.username || url.password)
    throw invalid("returned an invalid audio download URL");
  // This is a signed storage URL, not an Inworld API endpoint. Never forward Basic auth.
  let response: Response;
  try {
    response = await fetch(url.href, { signal, redirect: "error" });
  } catch {
    signal.throwIfAborted();
    // Signed query parameters must not become a persisted error or log entry.
    throw invalid("audio download could not be reached; retrying the existing job");
  }
  if (!response.ok)
    throw invalid(`audio download answered ${response.status}; retrying the existing job`);
  if (!response.body) throw invalid("answered with no audio");
  const reader = response.body.getReader();
  let heard = false;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      if (value.length) {
        heard = true;
        yield value;
      }
    }
  } catch {
    signal.throwIfAborted();
    throw invalid("audio download stopped; retrying the existing job");
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  if (!heard) throw invalid("answered with no audio");
}
async function check(response: Response, key: string): Promise<void> {
  if (response.ok) return;
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
    message: `Inworld async answered ${response.status}: ${detail || response.statusText}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}
function clean(message: string, key: string): string {
  return redact(message.replaceAll(key, "[redacted]"));
}
function invalid(detail: string): Error {
  return providerError({ kind: "other", message: `Inworld ${detail}.` });
}
