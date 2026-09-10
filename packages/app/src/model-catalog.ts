import { falModels } from "./adapters/image/fal.js";
import { googleImageModels } from "./adapters/image/google.js";
import { openAiImageModels } from "./adapters/image/openai.js";
import { replicateModels } from "./adapters/image/replicate.js";
import { claudeCodeModels } from "./adapters/llm/claude-code.js";
import { codexModels } from "./adapters/llm/codex.js";
import { geminiModels } from "./adapters/llm/gemini.js";
import { cartesiaModels } from "./adapters/tts/cartesia.js";
import { elevenLabsModels } from "./adapters/tts/elevenlabs.js";
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
    "claude-code": claudeCodeModels,
    codex: codexModels,
    gemini: geminiModels,
    elevenlabs: elevenLabsModels,
    "openai-tts": openAiTtsModels,
    cartesia: cartesiaModels,
    inworld: inworldModels,
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
