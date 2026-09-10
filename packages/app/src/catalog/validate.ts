import type { RunDraft } from "../slices/admission/model.js";
import type { FieldError } from "../slices/admission/rules.js";
import type { CatalogueStore } from "./store.js";
export function modelFields(draft: RunDraft, catalogue?: CatalogueStore): FieldError[] {
  if (!catalogue) return [];
  const fields: FieldError[] = [];
  const needLlm =
    draft.sources.research === "generate" ||
    draft.sources.article === "generate" ||
    draft.sources.thumbnail === "prompt_by_llm" ||
    draft.intro?.mode === "llm" ||
    draft.outro?.mode === "llm";
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
    if (!needed || !choice) continue;
    const model = catalogue.models(choice.provider, family).find((m) => m.id === choice.model);
    if (!model)
      fields.push({ field, message: "Choose an enabled model from the current catalogue." });
    else if ("llm" in model && choice.thinking && !model.llm.thinking?.[choice.thinking])
      fields.push({ field, message: "Choose a supported thinking setting for this model." });
    else if ("llm" in model && draft.sources.research === "generate" && !model.llm.webSearch)
      fields.push({
        field,
        message: "This model cannot perform web research. Choose another or turn Research off.",
      });
    else if ("image" in model && !model.image.aspectRatios.includes(draft.format))
      fields.push({ field, message: "This image model does not support the selected shape." });
  }
  return fields;
}
