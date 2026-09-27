import type { RunDraft } from "../slices/admission/model.js";
import {
  type FieldError,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "../slices/admission/rules.js";
import { isLocalCliProvider } from "../slices/settings/model.js";
import { usesAnimation } from "../slices/video/edit-settings.js";
import { referenceRefusal, takesReferenceImage, videoModelsOf } from "./schema.js";
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
    usesNarrationPreparation(draft) ||
    usesYoutubeDescription(draft) ||
    usesShorts(draft);
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
        ["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail) ||
        usesShorts(draft),
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
    else if ("image" in model && choice.thinking)
      fields.push({
        field: "images.thinking",
        message: "This image model has no effort setting. Set Effort back to Model default.",
      });
    else if ("llm" in model && draft.sources.research === "generate" && !model.llm.webSearch)
      fields.push({
        field,
        message:
          "This model cannot search the web for research. Choose another model or turn Research off.",
      });
    else if (
      "image" in model &&
      (draft.sources.images === "generate" ||
        ["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail)) &&
      !model.image.aspectRatios.includes(draft.format)
    )
      fields.push({
        field,
        message: "This image model cannot make images in this video's shape. Choose another model.",
      });
    // The shorts are always vertical, whatever shape the video is.
    else if ("image" in model && usesShorts(draft) && !model.image.aspectRatios.includes("9:16"))
      fields.push({
        field,
        message:
          "This image model cannot make the vertical (9:16) images Shorts need. Choose another image model, or turn Shorts off.",
      });
  }
  // The establishing image needs a model that takes an input image; the catalogue says which.
  // The Codex CLI always can, so only the keyed providers are looked up.
  if (
    usesReference(draft) &&
    draft.images !== undefined &&
    !isLocalCliProvider(draft.images.provider)
  ) {
    const images = draft.images;
    const model = catalogue.models(images.provider, "image").find((m) => m.id === images.model);
    if (model !== undefined && !takesReferenceImage(model))
      fields.push({ field: "reference.source", message: referenceRefusal });
  }
  // Animate images runs on the image provider's image-to-video models.
  if (usesAnimation(draft) && draft.images !== undefined) {
    const model = draft.videoEdit?.animateModel ?? "";
    const offered = videoModelsOf(catalogue.read(), draft.images.provider);
    if (offered.length === 0)
      fields.push({
        field: "videoEdit.animateModel",
        message:
          "This image provider can't animate images. Choose fal.ai or Replicate as the image provider (on Play's Images rail, or in Edit project → Providers), or turn Animate images off.",
      });
    else if (model.trim() !== "" && !offered.some((one) => one.id === model))
      fields.push({
        field: "videoEdit.animateModel",
        message:
          "This image-to-video model is no longer in Slopify's model list. Choose another under Animate images.",
      });
  }
  return fields;
}
