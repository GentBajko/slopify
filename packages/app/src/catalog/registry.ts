import type { LlmEvent } from "../kernel/ports/llm.js";
import { providerError } from "../kernel/ports/model.js";
import type { Registry } from "../kernel/ports/registry.js";
import type { TtsAudio } from "../kernel/ports/tts.js";
import { isLocalCliProvider } from "../slices/settings/model.js";
import type { CatalogueStore } from "./store.js";

export function curateRegistry(registry: Registry, catalogue: CatalogueStore): Registry {
  const requireModel = (
    provider: string,
    family: "llm" | "tts" | "image",
    id: string | undefined,
  ) => {
    const models = catalogue.models(provider, family);
    const model = id === undefined ? models[0] : models.find((m) => m.id === id);
    if (!model)
      throw providerError({
        kind: "unsupported",
        message: `${provider}: this model is not enabled in the current catalogue. Choose a supported model in Run settings.`,
      });
    return model;
  };
  return {
    list: registry.list,
    llm: (id) => {
      const port = registry.llm(id);
      if (isLocalCliProvider(id)) {
        return {
          ...port,
          models: () => port.models(),
          complete: async function* (request): AsyncGenerator<LlmEvent> {
            if (request.model.trim() === "")
              throw providerError({ kind: "unsupported", message: "Choose a model ID." });
            let models: Awaited<ReturnType<typeof port.models>> | undefined;
            try {
              models = await port.models();
            } catch {
              // A failed metadata read permits an exact manual ID; generation still
              // decides whether the installed CLI/account accepts it.
            }
            const selected = models?.find((model) => model.id === request.model);
            if (models !== undefined && selected === undefined)
              throw providerError({
                kind: "unsupported",
                message: "This model is not available in the installed CLI.",
              });
            if (
              request.thinking !== undefined &&
              selected !== undefined &&
              !selected.thinkingModes?.includes(request.thinking)
            )
              throw providerError({
                kind: "unsupported",
                message: "This model does not support the selected thinking setting.",
              });
            if (request.webSearch && !port.capabilities.webSearch)
              throw providerError({
                kind: "unsupported",
                message: "This CLI does not support research web search.",
              });
            const thinkingConfig =
              id === "codex" && request.thinking !== undefined
                ? { effort: request.thinking === "off" ? ("none" as const) : request.thinking }
                : undefined;
            yield* port.complete({
              ...request,
              ...(request.thinkingConfig === undefined && thinkingConfig ? { thinkingConfig } : {}),
            });
          },
        };
      }
      return {
        ...port,
        models: async () =>
          catalogue.models(id, "llm").map((m) => ({
            ...m,
            ...("llm" in m && m.llm.thinking
              ? {
                  thinkingModes: Object.keys(m.llm.thinking).filter(
                    (mode): mode is import("../kernel/ports/llm.js").ThinkingMode =>
                      ["off", "low", "medium", "high", "xhigh"].includes(mode),
                  ),
                }
              : {}),
          })),
        complete: async function* (request): AsyncGenerator<LlmEvent> {
          const model = requireModel(id, "llm", request.model);
          if (!("llm" in model)) throw new Error("Invalid LLM catalogue entry");
          if (request.webSearch && !model.llm.webSearch)
            throw providerError({
              kind: "unsupported",
              message: "This model does not support research web search.",
            });
          const thinkingConfig =
            request.thinking === undefined ? undefined : model.llm.thinking?.[request.thinking];
          if (request.thinking !== undefined && !thinkingConfig)
            throw providerError({
              kind: "unsupported",
              message:
                "This model does not support the selected thinking setting. Choose an available setting.",
            });
          yield* port.complete({
            ...request,
            ...(request.thinkingConfig === undefined && thinkingConfig ? { thinkingConfig } : {}),
          });
        },
      };
    },
    image: (id) => {
      const port = registry.image(id);
      if (id === "codex-image") {
        return {
          ...port,
          models: () => port.models(),
          generate: async (request) => {
            if (!(await port.models()).some((model) => model.id === request.model))
              throw providerError({
                kind: "unsupported",
                message: "The Codex image capability is unavailable.",
              });
            return port.generate(request);
          },
        };
      }
      return {
        ...port,
        models: async () => catalogue.models(id, "image"),
        generate: async (request) => {
          const model = requireModel(id, "image", request.model);
          if (!("image" in model) || !model.image.aspectRatios.includes(request.aspect))
            throw providerError({
              kind: "unsupported",
              message: "This model does not support the selected video shape.",
            });
          return port.generate(request);
        },
      };
    },
    tts: (id) => {
      const port = registry.tts(id);
      return {
        ...port,
        models: async () => catalogue.models(id, "tts"),
        synthesize: async (request): Promise<TtsAudio> => {
          // Retrieval resumes an already accepted job even if new submissions are disabled.
          if (request.continuation?.read() !== undefined) return port.synthesize(request);
          const model = requireModel(id, "tts", request.model);
          if (!("tts" in model)) throw new Error("Invalid TTS catalogue entry");
          if (request.text.length > model.tts.maxCharacters)
            throw providerError({
              kind: "unsupported",
              message: `${id}: this physical narration request exceeds the current ${model.tts.maxCharacters}-character limit. Rebuild narration to split it using the new limit.`,
            });
          return port.synthesize({ ...request, model: model.id });
        },
      };
    },
  };
}
