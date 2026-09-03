import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { ProviderErrorKind } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import { retryAfter } from "../retry-after.js";

// The HTTP gateway adapter for Cartesia (01-architecture Module boundaries). `fetch` and
// nothing else; `/tts/bytes` streams the audio it renders, so the response body is
// already the stream the port asks for.

export const cartesiaBase = "https://api.cartesia.ai";
// Cartesia pins behaviour to a dated version header and refuses a request without one.
// This is the version the request bodies below are written against, so it is sent as a
// constant rather than left to the account's default.
export const cartesiaVersion = "2026-03-01";
export const cartesiaModel = "sonic-3.5";
// mp3 is the port's container; `bit_rate` is required for it and `sample_rate` fixes the
// rate the concatenation of `logic/08` step 4 then keeps.
const outputFormat = { container: "mp3", bit_rate: 128_000, sample_rate: 44_100 } as const;

export interface CartesiaDeps {
  // Injected so a test never needs the network and `main.ts` owns the real one.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held (`logic/02` §Q16).
  readonly key: () => string | undefined;
}

// The structured error of API version 2026-03-01 and newer.
const errorBody = z.object({
  error_code: z.string().optional(),
  title: z.string().optional(),
  message: z.string().optional(),
});

export function cartesiaTts(deps: CartesiaDeps): TtsPort {
  return {
    id: "cartesia",
    capabilities: { streams: true },
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const response = await deps.fetch(`${cartesiaBase}/tts/bytes`, {
        method: "POST",
        signal: req.signal,
        headers: {
          "X-API-Key": keyOf(deps),
          "Cartesia-Version": cartesiaVersion,
          "Content-Type": "application/json",
        },
        // `logic/08` §Q69: no pre-check on length; Cartesia's own limit surfaces as its
        // error. `language` is left out so the model reads it off the transcript.
        body: JSON.stringify({
          model_id: cartesiaModel,
          transcript: req.text,
          voice: { mode: "id", id: req.voiceId },
          output_format: outputFormat,
        }),
      });
      if (!response.ok) {
        throw await failure(response, req.voiceId);
      }
      if (response.body === null) {
        throw providerError({ kind: "other", message: "Cartesia answered with no audio" });
      }
      return { audio: response.body, container: "mp3" };
    },
  };
}

function keyOf(deps: CartesiaDeps): string {
  const key = deps.key();
  // `logic/02` §Q13: an absent key is terminal, so it never becomes a request.
  if (key === undefined || key === "") {
    throw providerError({ kind: "missing_key", message: "no Cartesia key is stored" });
  }
  return key;
}

function kindOf(status: number): ProviderErrorKind {
  if (status === 401 || status === 403) {
    return "auth";
  }
  // `concurrency_limited` is the plan's own limit and arrives as a 429 like any other, so
  // the status is enough and the code below only reaches the message.
  if (status === 429) {
    return "rate_limit";
  }
  // ceiling: as in the other two adapters, everything else is `other` and is retried.
  return "other";
}

async function failure(response: Response, voiceId: string): Promise<Error> {
  const text = await response.text().catch(() => "");
  const message = redact(detailOf(text) || response.statusText);
  const retryAfterMs = retryAfter(response.headers.get("retry-after"));
  return providerError({
    kind: kindOf(response.status),
    // `logic/02` §Q14: `voice_not_found` has to say which voice was asked for; Cartesia's
    // own message does not repeat the id.
    message: `Cartesia answered ${response.status} for voice ${voiceId}: ${message}`,
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

function detailOf(text: string): string {
  const parsed = errorBody.safeParse(safeJson(text));
  if (!parsed.success) {
    return text.trim();
  }
  const { error_code: code, message } = parsed.data;
  // The code is what an integration is told to switch on and the message is the sentence;
  // both are the provider's own words, so both are shown.
  const parts = [code, message].filter((part) => part !== undefined && part !== "");
  return parts.length === 0 ? text.trim() : parts.join(": ");
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}
