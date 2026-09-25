import type { RunDraft } from "../slices/admission/model.js";
import { type FieldError, usesNarrationPreparation } from "../slices/admission/rules.js";
import { isLocalCliProvider } from "../slices/settings/model.js";
import type { CatalogueStore } from "./store.js";
export function modelFields(draft: RunDraft, catalogue?: CatalogueStore): FieldError[] {
  if (!catalogue) return [];
  const fields: FieldError[] = [];
  const needLlm =
    draft.sources.research === "generate" ||
    draft.sources.article === "generate" ||
    draft.sources.thumbnail === "prompt_by_llm" ||
    draft.intro?.mode === "llm" ||
    draft.outro?.mode === "llm" ||
    usesNarrationPreparation(draft);
  const checks = [
    { field: "llm", family: "llm", choice: draft.llm, needed: needLlm },
    {
      field: "audio",
      family: "tts",
      choice: draft.audio,
      needed: draft.sources.audio === "generate",
    },
    {
      field: "images",
      family: "image",
      choice: draft.images,
      needed:
        draft.sources.images === "generate" ||
        ["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail),
    },
  ] as const;
  for (const { field, family, choice, needed } of checks) {
    if (!needed || !choice || isLocalCliProvider(choice.provider)) continue;
    const model = catalogue.models(choice.provider, family).find((m) => m.id === choice.model);
    if (!model)
      fields.push({
        field,
        message: "This model is no longer in Slopify's model list. Choose another model.",
      });
    else if ("llm" in model && choice.thinking && !model.llm.thinking?.[choice.thinking])
      fields.push({
        field,
        message: "This model does not support that thinking setting. Choose another.",
      });
    else if ("llm" in model && draft.sources.research === "generate" && !model.llm.webSearch)
      fields.push({
        field,
        message:
          "This model cannot search the web for research. Choose another model or turn Research off.",
      });
    else if ("image" in model && !model.image.aspectRatios.includes(draft.format))
      fields.push({
        field,
        message: "This image model cannot make images in this video's shape. Choose another model.",
      });
  }
  return fields;
}
