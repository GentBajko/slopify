import type { StageKind } from "@app/kernel/pipeline.js";
import { sourceOf } from "@app/slices/admission/model.js";
import type { RevisionView } from "@app/slices/revisions/model.js";

// Presentation eligibility only; the server remains authoritative for every rerun.
export function canRerunSection(view: RevisionView, stage: StageKind): boolean {
  const { config, content, fingerprints } = view.revision;
  switch (stage) {
    case "research":
      return config.sources.research === "generate";
    case "article":
      return config.sources.article === "generate" && !content.articleEdited;
    case "audio":
      return (
        config.sources.audio === "generate" &&
        Object.keys(fingerprints).some((key) => {
          if (
            !/^audio:(body:.+|intro|outro):[0-9]+$/.test(key) &&
            !/^audio:(body|intro|outro):future$/.test(key)
          )
            return false;
          return !Object.entries(content.narrationOverrides).some(
            ([logical, override]) =>
              override.kind === "asset" && (key === logical || key.startsWith(`${logical}:`)),
          );
        })
      );
    case "images":
      return (
        config.sources.images !== "off" &&
        content.imageOrder.some((key) => content.imageDefinitions[key]?.source === "generate")
      );
    case "thumbnail":
      return (
        config.sources.thumbnail === "from_prompt" || config.sources.thumbnail === "prompt_by_llm"
      );
    case "video":
      return config.sources.video !== "off" || config.sources.audio !== "off";
    case "document":
      return sourceOf(config.sources, "document") === "generate";
  }
}
