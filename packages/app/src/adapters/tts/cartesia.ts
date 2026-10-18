import { z } from "zod";
import { redact } from "../../kernel/log.js";
import type { ModelInfo } from "../../kernel/ports/model.js";
import { providerError } from "../../kernel/ports/model.js";
import type { TtsAudio, TtsPort, TtsRequest } from "../../kernel/ports/tts.js";
import { httpFailure, noAudio, voiceFix } from "../explain.js";
import {
  failureText,
  httpProviderError,
  kindOfStatus,
  requireKey,
  safeJson,
} from "../http-failure.js";
import { cartesiaLanguages, lookUp } from "./voice-languages.js";

// The HTTP gateway adapter for Cartesia. `fetch` and
// nothing else; `/tts/bytes` streams the audio it renders, so the response body is
// already the stream the port asks for.

export const cartesiaBase = "https://api.cartesia.ai";
// Cartesia pins behaviour to a dated version header and refuses a request without one.
// This is the version the request bodies below are written against, so it is sent as a
// constant rather than left to the account's default.
export const cartesiaVersion = "2026-03-01";
export const cartesiaModel = "sonic-3.5";
// Cartesia publishes model IDs in its docs, with no model-list API. Stable family aliases
// receive new snapshots automatically: https://docs.cartesia.ai/build-with-cartesia/tts-models/latest
export const cartesiaModels: readonly ModelInfo[] = [
  { id: "sonic-3.6", name: "Sonic 3.6" },
  { id: "sonic-3.5", name: "Sonic 3.5" },
  { id: "sonic-3", name: "Sonic 3" },
];
// mp3 is the port's container; `bit_rate` is required for it and `sample_rate` fixes the
// rate the concatenation then keeps.
const outputFormat = { container: "mp3", bit_rate: 128_000, sample_rate: 44_100 } as const;

export interface CartesiaDeps {
  // Injected so a test never needs the network.
  readonly fetch: typeof globalThis.fetch;
  // Called for every request, never held.
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
    voiceLanguages: async (voiceId, signal) => {
      const key = deps.key();
      if (key === undefined || key === "") return undefined;
      return cartesiaLanguages(
        await lookUp(
          deps.fetch,
          `${cartesiaBase}/voices/${encodeURIComponent(voiceId)}`,
          { "X-API-Key": key, "Cartesia-Version": cartesiaVersion },
          signal,
        ),
      );
    },
    models: async (): Promise<readonly ModelInfo[]> => cartesiaModels,
    synthesize: async (req: TtsRequest): Promise<TtsAudio> => {
      const response = await deps.fetch(`${cartesiaBase}/tts/bytes`, {
        method: "POST",
        signal: req.signal,
        headers: {
          "X-API-Key": keyOf(deps),
          "Cartesia-Version": cartesiaVersion,
          "Content-Type": "application/json",
        },
        // No pre-check on length; Cartesia's own limit surfaces as its
        // error. `language` is left out so the model reads it off the transcript.
        body: JSON.stringify({
          model_id: req.model ?? cartesiaModel,
          transcript: req.text,
          voice: { mode: "id", id: req.voiceId },
          output_format: outputFormat,
        }),
      });
      if (!response.ok) {
        throw await failure(response, req.voiceId);
      }
      if (response.body === null) {
        throw providerError({ kind: "other", message: noAudio("Cartesia") });
      }
      return { audio: response.body, container: "mp3" };
    },
  };
}

function keyOf(deps: CartesiaDeps): string {
  return requireKey(deps.key(), "Cartesia");
}

async function failure(response: Response, voiceId: string): Promise<Error> {
  const text = await failureText(response);
  const message = redact(detailOf(text) || response.statusText);
  return httpProviderError(
    response,
    kindOfStatus(response.status),
    // `voice_not_found` has to say which voice was asked for; Cartesia's
    // own message does not repeat the id.
    httpFailure({
      provider: "Cartesia",
      status: response.status,
      detail: message,
      subject: `narration request for voice "${voiceId}"`,
      fix: voiceFix(voiceId),
    }),
  );
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
