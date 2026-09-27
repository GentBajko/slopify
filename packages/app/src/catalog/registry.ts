import { type LlmEvent, thinkingModes } from "../kernel/ports/llm.js";
import { providerError } from "../kernel/ports/model.js";
import type { Registry } from "../kernel/ports/registry.js";
import type { TtsAudio } from "../kernel/ports/tts.js";
import { isLocalCliProvider } from "../slices/settings/model.js";
import { referenceRefusal, takesReferenceImage } from "./schema.js";
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
        message: `The chosen ${provider} model is no longer in Slopify's model list. In the Edit tab, choose Edit project and change it under Providers, then use Continue the run.`,
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
              throw providerError({
                kind: "unsupported",
                message:
                  "No model is chosen for this step. In the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
              });
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
                message:
                  "The chosen model is not available in the AI command-line tool on your computer. Update the tool, or pick another model: in the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
              });
            if (
              request.thinking !== undefined &&
              selected !== undefined &&
              !selected.thinkingModes?.includes(request.thinking)
            )
              throw providerError({
                kind: "unsupported",
                message:
                  "The chosen model does not support this thinking setting. In the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
              });
            if (request.webSearch && !port.capabilities.webSearch)
              throw providerError({
                kind: "unsupported",
                message:
                  "This command-line tool cannot search the web for research. Choose another text provider or turn Research off in the Edit tab under Edit project, then use Continue the run.",
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
                      (thinkingModes as readonly string[]).includes(mode),
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
              message:
                "The chosen model cannot search the web for research. Choose another model or turn Research off in the Edit tab under Edit project, then use Continue the run.",
            });
          const thinkingConfig =
            request.thinking === undefined ? undefined : model.llm.thinking?.[request.thinking];
          if (request.thinking !== undefined && !thinkingConfig)
            throw providerError({
              kind: "unsupported",
              message:
                "The chosen model does not support this thinking setting. In the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
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
            const selected = (await port.models()).find((model) => model.id === request.model);
            if (selected === undefined)
              throw providerError({
                kind: "unsupported",
                message:
                  request.model === "codex-imagegen"
                    ? "Image generation is not available in the Codex CLI on your computer. Update Codex CLI, or choose another image provider in the Edit tab under Edit project, then use Continue the run."
                    : "The chosen Codex model for images is not in the Codex CLI's model list on your computer. Update Codex CLI, or pick another model for images: in the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
              });
            if (
              request.thinking !== undefined &&
              !selected.thinkingModes?.includes(request.thinking)
            )
              throw providerError({
                kind: "unsupported",
                message:
                  "The chosen Codex model does not support this effort for images. In the Edit tab, choose Edit project and change the images' Effort under Providers, then use Continue the run.",
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
              message:
                "The chosen image model cannot make images in this video's shape. In the Edit tab, choose Edit project and change it under Providers, then use Continue the run.",
            });
          if (request.thinking !== undefined)
            throw providerError({
              kind: "unsupported",
              message:
                "The chosen image model has no effort setting. In the Edit tab, choose Edit project and set the images' Effort back to Model default under Providers, then use Continue the run.",
            });
          if (request.reference !== undefined && !takesReferenceImage(model))
            throw providerError({
              kind: "unsupported",
              message: referenceRefusal,
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
              message: `A piece of narration is longer than this voice model's ${model.tts.maxCharacters}-character limit. Use More → make it again in its section on Audio so Slopify splits it into shorter pieces.`,
            });
          return port.synthesize({ ...request, model: model.id });
        },
      };
    },
  };
}
