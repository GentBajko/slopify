import type { ProviderId } from "./model.js";

// The step list Settings → Providers shows beside each key field. Every link is the provider's
// own page, checked against its documentation on 2026-09-27.
export interface GuideLink {
  readonly label: string;
  readonly url: string;
}
export interface KeyGuide {
  readonly signUp: GuideLink;
  readonly keyPage: GuideLink;
  readonly billing?: GuideLink;
  // In order: what to click, from signing up to pasting the key.
  readonly steps: readonly string[];
  // What the key needs: permissions, scopes, billing or verification.
  readonly permissions: string;
  readonly docs: GuideLink;
}

const openAi: KeyGuide = {
  signUp: { label: "platform.openai.com/signup", url: "https://platform.openai.com/signup" },
  keyPage: { label: "platform.openai.com/api-keys", url: "https://platform.openai.com/api-keys" },
  billing: {
    label: "Billing",
    url: "https://platform.openai.com/settings/organization/billing/overview",
  },
  steps: [
    "Sign up or sign in to the OpenAI platform.",
    "Open Billing and buy prepaid credit (new accounts need at least $5 before any call works).",
    "Open API keys, choose Create new secret key, and copy it (it is shown once).",
    "Paste it here, choose Save, then Test.",
  ],
  permissions:
    "A key with All permissions works. A restricted key needs Models: Read (for Test) and Model capabilities: Request (for speech and images). GPT Image models may also need Verify Organization under Settings → Organization → General on the OpenAI platform.",
  docs: {
    label: "OpenAI API docs",
    url: "https://developers.openai.com/api/docs/guides/error-codes",
  },
};

export const keyGuides: Readonly<Partial<Record<ProviderId, KeyGuide>>> = {
  openrouter: {
    signUp: { label: "openrouter.ai/sign-up", url: "https://openrouter.ai/sign-up" },
    keyPage: { label: "openrouter.ai/settings/keys", url: "https://openrouter.ai/settings/keys" },
    billing: { label: "Credits", url: "https://openrouter.ai/settings/credits" },
    steps: [
      "Sign up at OpenRouter.",
      "Open Credits and buy credit (paid models are charged from it; a negative balance stops even free models).",
      "Open Keys, choose Create API key, and copy it.",
      "Paste it here, choose Save, then Test.",
    ],
    permissions:
      "Keys have no scopes. If you set a credit limit on the key, keep it above what a run costs.",
    docs: { label: "OpenRouter docs", url: "https://openrouter.ai/docs/api-reference/limits" },
  },
  "openai-tts": openAi,
  "openai-image": openAi,
  "google-image": {
    signUp: { label: "aistudio.google.com", url: "https://aistudio.google.com" },
    keyPage: { label: "aistudio.google.com/apikey", url: "https://aistudio.google.com/apikey" },
    billing: { label: "Projects → Set up billing", url: "https://aistudio.google.com/projects" },
    steps: [
      "Sign in to Google AI Studio with your Google account.",
      "Open Projects and choose Set up billing next to your project: Gemini image models are not available on the free tier.",
      "Open API keys, choose Create API key, and copy it.",
      "Paste it here, choose Save, then Test.",
    ],
    permissions:
      "Use a key made in AI Studio. An older Google Cloud key must be set to Restrict to Gemini API only, or Google rejects it.",
    docs: { label: "Gemini API keys", url: "https://ai.google.dev/gemini-api/docs/api-key" },
  },
  fal: {
    signUp: { label: "fal.ai/login", url: "https://fal.ai/login" },
    keyPage: { label: "fal.ai/dashboard/keys", url: "https://fal.ai/dashboard/keys" },
    billing: { label: "Billing", url: "https://fal.ai/dashboard/billing" },
    steps: [
      "Sign up at fal.ai.",
      "Open Billing and buy credit: fal.ai is prepaid and locks the account when the balance runs out.",
      "Open Keys, choose Add key with the API scope, and copy it.",
      "Paste it here, choose Save, then Test.",
    ],
    permissions: "The API scope is enough; Slopify does not need an ADMIN key.",
    docs: {
      label: "fal.ai authentication",
      url: "https://fal.ai/docs/model-apis/authentication",
    },
  },
  replicate: {
    signUp: { label: "replicate.com/signin", url: "https://replicate.com/signin" },
    keyPage: {
      label: "replicate.com/account/api-tokens",
      url: "https://replicate.com/account/api-tokens",
    },
    billing: { label: "Billing", url: "https://replicate.com/account/billing" },
    steps: [
      "Sign in to Replicate.",
      "Open Billing and buy credit: Replicate needs credit up front before it runs paid models.",
      "Open API tokens, create a token, and copy it (it starts with r8_).",
      "Paste it here, choose Save, then Test.",
    ],
    permissions: "Tokens have no scopes.",
    docs: { label: "Replicate billing", url: "https://replicate.com/docs/topics/billing" },
  },
  elevenlabs: {
    signUp: { label: "elevenlabs.io/app/sign-up", url: "https://elevenlabs.io/app/sign-up" },
    keyPage: {
      label: "elevenlabs.io/app/developers/api-keys",
      url: "https://elevenlabs.io/app/developers/api-keys",
    },
    steps: [
      "Sign up at ElevenLabs.",
      "Open Developers → API keys, choose Create key, and copy it.",
      "Paste it here, choose Save, then Test.",
    ],
    permissions:
      "A restricted key needs Text to Speech access and Models read access (models_read) for Test; Voices read helps when picking voices. Remove any credit quota or IP allowlist that would block this computer.",
    docs: {
      label: "ElevenLabs API keys",
      url: "https://elevenlabs.io/docs/api-reference/models/list",
    },
  },
  cartesia: {
    signUp: { label: "play.cartesia.ai/sign-up", url: "https://play.cartesia.ai/sign-up" },
    keyPage: { label: "play.cartesia.ai/keys", url: "https://play.cartesia.ai/keys" },
    steps: [
      "Sign up at Cartesia (the free plan needs no card).",
      "Open API Keys, create a key, and copy it (it starts with sk_car_).",
      "Paste it here, choose Save, then Test.",
    ],
    permissions: "Keys have no scopes.",
    docs: {
      label: "Cartesia authentication",
      url: "https://docs.cartesia.ai/get-started/authenticate-your-client-applications",
    },
  },
  inworld: {
    signUp: { label: "platform.inworld.ai/signup", url: "https://platform.inworld.ai/signup" },
    keyPage: {
      label: "platform.inworld.ai/api-keys",
      url: "https://platform.inworld.ai/api-keys",
    },
    billing: { label: "Billing", url: "https://platform.inworld.ai/billing" },
    steps: [
      "Sign up at the Inworld platform.",
      "Open API Keys and choose Generate new key (a Standard key, not Realtime-only).",
      "Copy the Base64 credentials value exactly as shown, without encoding it again.",
      "Paste it here, choose Save, then Test.",
    ],
    permissions: "A Standard key covers speech and reading voices. Realtime-only keys do not work.",
    docs: { label: "Inworld API keys", url: "https://docs.inworld.ai/portal/api-keys" },
  },
};
