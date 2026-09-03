import type { ModelInfo } from "@app/kernel/ports/model.js";
import type { ProviderId } from "@app/slices/settings/model.js";

// What Play's Model picker offers per provider.
//
// ceiling: the app has no endpoint that lists models. `GET /api/providers` answers
// readiness and nothing else, and the lists the registry holds live inside the adapter
// modules - `adapters/image/fal.ts` and friends - which reach `node:fs` through
// `kernel/log.ts` and `node:child_process` through `adapters/llm/run-cli.ts`, so the
// browser cannot import them the way it imports the admission rule. The catalogue is
// therefore repeated here, verbatim from those adapters. The upgrade is a `models`
// member on the providers route's rows, filled by the composition root from the same
// constants; this file then becomes one line that reads it.
//
// OpenRouter is deliberately empty: its adapter fetches the live catalogue per call and
// it runs to thousands of entries, so its model is typed rather than picked.
export const providerModels: Readonly<Record<ProviderId, readonly ModelInfo[]>> = {
  openrouter: [],
  "claude-code": [
    { id: "fable", name: "Claude Fable (latest)" },
    { id: "opus", name: "Claude Opus (latest)" },
    { id: "sonnet", name: "Claude Sonnet (latest)" },
    { id: "haiku", name: "Claude Haiku (latest)" },
  ],
  codex: [
    { id: "gpt-5.1-codex-max", name: "GPT-5.1 Codex Max" },
    { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
  ],
  // The three text-to-speech adapters each speak through one model, so the run carries
  // it without asking: the reference sheet draws TTS as a provider and a voice, no model.
  elevenlabs: [{ id: "eleven_multilingual_v2", name: "Eleven Multilingual v2" }],
  "openai-tts": [{ id: "gpt-4o-mini-tts", name: "GPT-4o mini TTS" }],
  cartesia: [{ id: "sonic-3.5", name: "Sonic 3.5" }],
  fal: [
    { id: "fal-ai/flux-2", name: "FLUX.2" },
    { id: "fal-ai/flux/dev", name: "FLUX.1 [dev]" },
    { id: "fal-ai/flux/schnell", name: "FLUX.1 [schnell]" },
  ],
  replicate: [
    { id: "black-forest-labs/flux-1.1-pro", name: "FLUX 1.1 [pro]" },
    { id: "black-forest-labs/flux-dev", name: "FLUX.1 [dev]" },
    { id: "black-forest-labs/flux-schnell", name: "FLUX.1 [schnell]" },
  ],
  "openai-image": [
    { id: "gpt-image-2", name: "GPT Image 2" },
    { id: "gpt-image-1.5", name: "GPT Image 1.5" },
    { id: "gpt-image-1", name: "GPT Image 1" },
    { id: "gpt-image-1-mini", name: "GPT Image 1 mini" },
  ],
};

// Widened so a provider id read off an answer can be looked up without being narrowed
// first, and guarded with `Object.hasOwn` so "constructor" answers with nothing rather
// than with Object's own.
const byId: Readonly<Record<string, readonly ModelInfo[]>> = providerModels;

export function modelsOf(provider: string): readonly ModelInfo[] {
  return Object.hasOwn(byId, provider) ? (byId[provider] ?? []) : [];
}

// The model a provider is picked with when the user has nothing to choose: a
// text-to-speech provider ships exactly one, and Play never draws a picker for it.
export function soleModelOf(provider: string): string {
  const listed = modelsOf(provider);
  return listed.length === 1 ? (listed[0]?.id ?? "") : "";
}
