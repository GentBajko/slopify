import { falModels } from "./adapters/image/fal.js";
import { googleImageModels } from "./adapters/image/google.js";
import { openAiImageModels } from "./adapters/image/openai.js";
import { replicateModels } from "./adapters/image/replicate.js";
import { cartesiaModels } from "./adapters/tts/cartesia.js";
import { elevenLabsModels } from "./adapters/tts/elevenlabs.js";
import { geminiTtsModels } from "./adapters/tts/gemini.js";
import { inworldModels } from "./adapters/tts/inworld.js";
import { openAiTtsModels } from "./adapters/tts/openai.js";
import type { ModelInfo, ProviderFamily } from "./kernel/ports/model.js";
import type { Registry } from "./kernel/ports/registry.js";

// Composition keeps provider-specific fallback data out of the HTTP and settings layers.
export function modelSources(registry: Registry): {
  readonly modelsFor: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>;
  readonly fallbackModelsFor: (provider: string) => readonly ModelInfo[];
} {
  const fallbacks: Readonly<Record<string, readonly ModelInfo[]>> = {
    elevenlabs: elevenLabsModels,
    "openai-tts": openAiTtsModels,
    cartesia: cartesiaModels,
    inworld: inworldModels,
    "google-tts": geminiTtsModels,
    fal: falModels,
    replicate: replicateModels,
    "openai-image": openAiImageModels,
    "google-image": googleImageModels,
  };
  return {
    modelsFor: (provider, family) => {
      if (family === "llm") return registry.llm(provider).models();
      if (family === "image") return registry.image(provider).models();
      return registry.tts(provider).models();
    },
    fallbackModelsFor: (provider) =>
      Object.hasOwn(fallbacks, provider) ? (fallbacks[provider] ?? []) : [],
  };
}

// A model list kept for a short while. Create checks a draft again after every pause in typing,
// and Claude Code lists its models by running its CLI (about a second each time), so the check
// and the start that follows read one list. A list that failed is asked for again.
export function keptModels(
  modelsFor: (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]>,
  keepMs: number,
  now: () => number = Date.now,
): (provider: string, family: ProviderFamily) => Promise<readonly ModelInfo[]> {
  const kept = new Map<
    string,
    { readonly at: number; readonly models: Promise<readonly ModelInfo[]> }
  >();
  return (provider, family) => {
    const key = `${family}:${provider}`;
    const at = now();
    const held = kept.get(key);
    if (held !== undefined && at - held.at < keepMs) return held.models;
    const models = modelsFor(provider, family);
    kept.set(key, { at, models });
    models.catch(() => {
      if (kept.get(key)?.models === models) kept.delete(key);
    });
    return models;
  };
}
