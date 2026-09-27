import type { KeyProbes, ModelProbe } from "../kernel/ports/key-probe.js";
import { cartesiaVersion } from "./tts/cartesia.js";

// Settings → Providers' Test button, per provider. Some answer a key they do not recognise
// with something other than 401: Google with 400 API_KEY_INVALID, ElevenLabs with 400
// invalid_api_key, Inworld with 403 "does not exist". Observed on 2026-09-27; their
// documentation says 401.
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });

// Health check → "Model reachable": one read per chosen model, or one of the list. A model's
// own page answers 404 when the key can't use it.
const openAiModel: ModelProbe = {
  url: (model) => `https://api.openai.com/v1/models/${encodeURIComponent(model)}`,
};
function listed(ids: (value: unknown) => readonly unknown[]) {
  return (body: string, model: string): boolean | undefined => {
    try {
      const found = ids(JSON.parse(body));
      return found.length === 0 ? undefined : found.includes(model);
    } catch {
      return undefined;
    }
  };
}
const field = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>)[key] : undefined;

export const keyProbes: KeyProbes = {
  openrouter: {
    url: "https://openrouter.ai/api/v1/key",
    headers: bearer,
    model: {
      url: () => "https://openrouter.ai/api/v1/models",
      lists: listed((body) => {
        const data = field(body, "data");
        return Array.isArray(data) ? data.map((one) => field(one, "id")) : [];
      }),
    },
  },
  "openai-tts": { url: "https://api.openai.com/v1/models", headers: bearer, model: openAiModel },
  "openai-image": { url: "https://api.openai.com/v1/models", headers: bearer, model: openAiModel },
  "google-image": {
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    headers: (key) => ({ "x-goog-api-key": key }),
    badKey: (status, body) => status === 400 && body.includes("API_KEY_INVALID"),
    model: {
      url: (model) =>
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model.replace(/^models\//, ""))}`,
    },
  },
  // fal.ai's model list answers without a key; its price lookup requires one.
  fal: {
    url: "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
    headers: (key) => ({ Authorization: `Key ${key}` }),
    model: {
      url: (model) =>
        `https://api.fal.ai/v1/models/pricing?endpoint_id=${encodeURIComponent(model)}`,
    },
  },
  replicate: {
    url: "https://api.replicate.com/v1/account",
    headers: bearer,
    // "owner/name", without a ":version".
    model: {
      url: (model) =>
        `https://api.replicate.com/v1/models/${(model.split(":")[0] ?? model)
          .split("/")
          .map(encodeURIComponent)
          .join("/")}`,
    },
  },
  elevenlabs: {
    url: "https://api.elevenlabs.io/v1/models",
    headers: (key) => ({ "xi-api-key": key }),
    badKey: (status, body) => status === 400 && body.includes("invalid_api_key"),
    model: {
      url: () => "https://api.elevenlabs.io/v1/models",
      lists: listed((body) =>
        Array.isArray(body) ? body.map((one) => field(one, "model_id")) : [],
      ),
    },
  },
  cartesia: {
    url: "https://api.cartesia.ai/voices?limit=1",
    headers: (key) => ({ "X-API-Key": key, "Cartesia-Version": cartesiaVersion }),
  },
  inworld: {
    url: "https://api.inworld.ai/voices/v1/voices?pageSize=1",
    headers: (key) => ({ Authorization: `Basic ${key}` }),
    badKey: (status, body) => status === 403 && /does not exist|was deleted/i.test(body),
  },
};
