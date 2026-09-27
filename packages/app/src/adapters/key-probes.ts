import type { KeyProbes } from "../kernel/ports/key-probe.js";
import { cartesiaVersion } from "./tts/cartesia.js";

// Settings → Providers' Test button, per provider. Some answer a key they do not recognise
// with something other than 401: Google with 400 API_KEY_INVALID, ElevenLabs with 400
// invalid_api_key, Inworld with 403 "does not exist". Observed on 2026-09-27; their
// documentation says 401.
const bearer = (key: string) => ({ Authorization: `Bearer ${key}` });
export const keyProbes: KeyProbes = {
  openrouter: { url: "https://openrouter.ai/api/v1/key", headers: bearer },
  "openai-tts": { url: "https://api.openai.com/v1/models", headers: bearer },
  "openai-image": { url: "https://api.openai.com/v1/models", headers: bearer },
  "google-image": {
    url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
    headers: (key) => ({ "x-goog-api-key": key }),
    badKey: (status, body) => status === 400 && body.includes("API_KEY_INVALID"),
  },
  // fal.ai's model list answers without a key; its price lookup requires one.
  fal: {
    url: "https://api.fal.ai/v1/models/pricing?endpoint_id=fal-ai/flux/dev",
    headers: (key) => ({ Authorization: `Key ${key}` }),
  },
  replicate: { url: "https://api.replicate.com/v1/account", headers: bearer },
  elevenlabs: {
    url: "https://api.elevenlabs.io/v1/models",
    headers: (key) => ({ "xi-api-key": key }),
    badKey: (status, body) => status === 400 && body.includes("invalid_api_key"),
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
