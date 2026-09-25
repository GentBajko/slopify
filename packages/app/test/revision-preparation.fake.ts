import type { Registry } from "../src/kernel/ports/registry.js";
import { preparationCatalogue } from "../src/slices/rebuild/runtime-narration.fake.js";
import { insertVoice } from "../src/slices/settings/repo.js";
import { composedFixture, current, save } from "./revision-rebuild.fake.js";

export async function preparationFixture(
  ports: Partial<Registry> = {},
  article: string = "First sentence. Second sentence.",
  upgradeFrom10: boolean = false,
  usePronunciationGlossary: boolean = false,
): Promise<
  Awaited<ReturnType<typeof composedFixture>> & {
    readonly view: ReturnType<typeof current>;
    readonly catalogue: typeof preparationCatalogue;
  }
> {
  const h = await composedFixture(ports, upgradeFrom10);
  const catalogue = {
    ...preparationCatalogue,
    providers: { openrouter: { maxConcurrent: 1 }, inworld: { maxConcurrent: 1 } },
  };
  h.setCatalogue(catalogue);
  insertVoice(h.deps.db, { id: "inworld-v", name: "Inworld", provider: "inworld", voiceId: "v" });
  const base = current(h.deps, h.projectId);
  const view = await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      narrationPrompt: "Delivery",
      llm: { provider: "openrouter", model: "llm" },
      audio: {
        provider: "inworld",
        model: "inworld-tts-2",
        voice: "v",
        ...(usePronunciationGlossary ? { usePronunciationGlossary: true } : {}),
      },
      sources: { ...base.revision.config.sources, images: "off", video: "off", audio: "generate" },
      chunking: { mode: "paragraph" },
      provided: { article },
      rendered: { narration: "Restrained delivery." },
    },
    content: {
      ...base.revision.content,
      articleMarkdown: article,
      articleEdited: true,
      imageOrder: [],
      imageDefinitions: {},
    },
  });
  return { ...h, view, catalogue };
}
