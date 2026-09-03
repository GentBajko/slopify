import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import { retryAfter } from "../retry-after.js";

// The HTTP gateway adapter for ElevenLabs (01-architecture Module boundaries). `fetch`
// and nothing else: 05-dependencies records global `fetch` at rung 3, and the response
// body already is the `ReadableStream<Uint8Array>` the port asks for, so an SDK would buy
// nothing but a dependency.

export const elevenLabsBase = "https://api.elevenlabs.io/v1";
// The /stream endpoint rather than the plain one: `capabilities.streams` is true, and the
// attempt wrapper measures its 120 s as an idle timeout between chunks only when bytes
// keep arriving (`logic/01` §Q62).
export const elevenLabsModel = "eleven_multilingual_v2";
// mp3 at the port's container, 44.1 kHz, 128 kbps: `kernel/ports/tts.ts` fixes mp3 and
// `logic/08` step 4 keeps the provider's own sample rate through the concatenation.
export const elevenLabsFormat = "mp3_44100_128";

export interface ElevenLabsDeps {
  // Injected so a test never needs the network and `main.ts` owns the real one.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held: an attempt in flight finishes on the key it
  // started with and the next one picks up a key saved since (`logic/02` §Q16).
  readonly key: () => string | undefined;
}

// A wire payload is narrowed, never cast. `detail` is an object on a handled failure and
// a string on the framework's own; anything else falls back to the raw text.
const errorBody = z.object({
  detail: z.union([
    z.object({ status: z.string().optional(), message: z.string().optional() }),
    z.string(),
  ]),
});

export function elevenLabsTts(deps: ElevenLabsDeps): TtsPort {
  return {
    id: "elevenlabs",
    capabilities: { streams: true },
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const voice = encodeURIComponent(req.voiceId);
      const response = await deps.fetch(
        `${elevenLabsBase}/text-to-speech/${voice}/stream?output_format=${elevenLabsFormat}`,
        {
          method: "POST",
          signal: req.signal,
          headers: { "xi-api-key": keyOf(deps), "Content-Type": "application/json" },
          // `logic/08` §Q69: no pre-check on length. A text past the model's limit comes
          // back as the provider's own 400 and that is what the stage shows.
          body: JSON.stringify({ text: req.text, model_id: elevenLabsModel }),
        },
      );
      if (!response.ok) {
        throw await failure(response, req.voiceId);
      }
      if (response.body === null) {
        throw providerError({ kind: "other", message: "ElevenLabs answered with no audio" });
      }
      return { audio: response.body, container: "mp3" };
    },
  };
}

function keyOf(deps: ElevenLabsDeps): string {
  const key = deps.key();
  // `logic/02` §Q13: an attempt that finds no key fails rather than calling anonymously.
  // `missing_key` rather than `auth` because the same rule makes it terminal.
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no ElevenLabs key is stored" });
  }
  return key;
}

// Only the adapter can read a vendor's status code, so only the adapter names the kind;
// the attempt wrapper maps it and nothing downstream classifies again (03-conventions).
function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: everything else is `other` and is retried, so a text past the character
  // limit fails the same way four times over. A terminal kind for "this request will
  // never work" would have to be added to the port's error contract first, which is not
  // this adapter's to widen.
  return "other";
}

async function failure(response: Response, voiceId: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  // The provider's own words, verbatim, through the same redactor the wrapper uses: an
  // error body is free to quote the key back and this is the first place it is held.
  const message = redact(detailOf(text) || response.statusText);
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    // `logic/02` §Q14: a rejected voice ID has to be named, and it is the one part of the
    // request the user chose. It is not secret, unlike everything else on the wire.
    message: `ElevenLabs answered ${response.status} for voice ${voiceId}: ${message}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function detailOf(text: string): string {
  const parsed = errorBody.safeParse(safeJson(text));
  if (!parsed.success) {
    return text.trim();
  }
  const { detail } = parsed.data;
  if (typeof detail === "string") {
    return detail;
  }
  // Both halves are kept: the status is the machine-readable reason
  // (`max_character_limit_exceeded`, `voice_not_found`) and the message is the sentence.
  return [detail.status, detail.message].filter((part) => part !== undefined).join(": ");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
