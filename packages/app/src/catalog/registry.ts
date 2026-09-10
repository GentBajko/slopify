import type { LlmEvent } from "../kernel/ports/llm.js";
import { providerError } from "../kernel/ports/model.js";
import type { Registry } from "../kernel/ports/registry.js";
import { splitText } from "../kernel/ports/text.js";
import type { TtsAudio, TtsRequest } from "../kernel/ports/tts.js";
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
          yield* port.complete({ ...request, ...(thinkingConfig ? { thinkingConfig } : {}) });
        },
      };
    },
    image: (id) => {
      const port = registry.image(id);
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
          const model = requireModel(id, "tts", request.model);
          if (!("tts" in model)) throw new Error("Invalid TTS catalogue entry");
          const parts = splitText(request.text, model.tts.maxCharacters);
          if (parts.length <= 1) return port.synthesize({ ...request, model: model.id });
          const abort = new AbortController();
          const signal = AbortSignal.any([request.signal, abort.signal]);
          const iterator = audioParts(
            parts,
            { ...request, model: model.id, signal },
            port.synthesize,
          );
          return {
            container: "mp3",
            audio: new ReadableStream<Uint8Array>(
              {
                async pull(controller) {
                  try {
                    const next = await iterator.next();
                    if (next.done) controller.close();
                    else controller.enqueue(next.value);
                  } catch (error) {
                    controller.error(error);
                  }
                },
                async cancel() {
                  abort.abort();
                  await iterator.return();
                },
              },
              { highWaterMark: 0 },
            ),
          };
        },
      };
    },
  };
}
async function* audioParts(
  parts: readonly string[],
  request: TtsRequest,
  synthesize: (request: TtsRequest) => Promise<TtsAudio>,
): AsyncGenerator<Uint8Array, void> {
  let tokens: Record<string, string> = {};
  const saved = request.continuation?.read();
  if (saved) {
    try {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
        tokens = Object.fromEntries(
          Object.entries(parsed).filter(
            (entry): entry is [string, string] => typeof entry[1] === "string",
          ),
        );
    } catch {
      /* A legacy single-job token cannot identify several split jobs. */
    }
  }
  for (const [index, text] of parts.entries()) {
    request.signal.throwIfAborted();
    // Body chunks are persisted individually by narration. Long intro/outro text
    // is bounded here as well; each split has its own remote continuation.

    const response = await synthesize({
      ...request,
      text,
      continuation: {
        read: () => tokens[String(index)],
        write: (value) => {
          tokens[String(index)] = value;
          request.continuation?.write(JSON.stringify(tokens));
        },
      },
    });
    const reader = response.audio.getReader();
    try {
      for (;;) {
        const next = await reader.read();
        request.signal.throwIfAborted();
        if (next.done) break;
        yield next.value;
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
