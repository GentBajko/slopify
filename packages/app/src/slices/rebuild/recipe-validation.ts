import type { RunConfig } from "../admission/model.js";
import {
  type FieldError,
  narrationPreparationFields,
  shortsFields,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
  videoEditFields,
  youtubeDescriptionFields,
} from "../admission/rules.js";
import { detectSlots, render } from "../admission/substitute.js";
import { imagesPerVideoMax } from "../images/scale.js";
import { loudnessFields } from "../loudness/model.js";
import { pauseFields } from "../narration/pauses-model.js";
import { reviewFields } from "../reviews/rules.js";
import type { RevisionContent } from "../revisions/model.js";
import { usesAnimation } from "../video/edit-settings.js";

export function validateRecipeInputs(
  config: RunConfig,
  content: RevisionContent,
): readonly FieldError[] {
  const fields: FieldError[] = [
    ...narrationPreparationFields(config),
    ...youtubeDescriptionFields(config),
    ...shortsFields(config),
    ...videoEditFields(config),
    ...reviewFields(config),
    ...loudnessFields(config.loudness),
    ...pauseFields(config),
  ];
  const llm =
    (config.sources.research === "generate" && config.sources.article !== "provide") ||
    (config.sources.article === "generate" && !content.articleEdited) ||
    config.sources.thumbnail === "prompt_by_llm" ||
    usesNarrationPreparation(config) ||
    usesYoutubeDescription(config) ||
    usesShorts(config) ||
    (config.sources.audio === "generate" &&
      (config.intro?.mode === "llm" || config.outro?.mode === "llm"));
  if (llm && (!config.llm?.provider.trim() || !config.llm.model.trim()))
    fields.push({ field: "llm", message: "Pick a text provider and model." });
  if (config.sources.audio === "generate") {
    if (!config.audio?.provider.trim() || !config.audio.model.trim())
      fields.push({ field: "audio", message: "Pick a narration provider and model." });
    else if (!config.audio.voice.trim())
      fields.push({ field: "audio.voice", message: "Pick a narration voice." });
  }
  const generatedImages =
    config.sources.images !== "off" &&
    content.imageOrder.some((key) => content.imageDefinitions[key]?.source === "generate");
  if (
    (generatedImages ||
      config.sources.thumbnail === "from_prompt" ||
      config.sources.thumbnail === "prompt_by_llm" ||
      usesShorts(config) ||
      usesAnimation(config)) &&
    (!config.images?.provider.trim() || !config.images.model.trim())
  )
    fields.push({ field: "images", message: "Pick an image provider and model." });
  // 60, or more for a project that scales its images with the narration (`images/scale.ts`).
  const imagesMax = imagesPerVideoMax(config);
  if (content.imageOrder.length > imagesMax)
    fields.push({
      field: "content.imageOrder",
      message: `Keep at most ${String(imagesMax)} images.`,
    });
  const chunking = config.chunking;
  const size =
    chunking?.mode === "words"
      ? chunking.words
      : chunking?.mode === "characters"
        ? chunking.characters
        : undefined;
  if (size !== undefined && (!Number.isInteger(size) || size < 1 || size > 1000000))
    fields.push({
      field: `chunking.${chunking?.mode}`,
      message: "Use a whole number from 1 to 1,000,000.",
    });
  const prompts: { field: string; raw: string | null; literal: string | undefined }[] = [];
  if (usesNarrationPreparation(config))
    prompts.push({
      field: "rendered.narration",
      raw: content.promptTemplates.narration ?? null,
      literal: config.rendered.narration,
    });
  // Only a picked Description prompt is checked: none picked uses the built-in one.
  if (
    usesYoutubeDescription(config) &&
    config.descriptionPrompt?.trim() &&
    content.promptTemplates.description != null
  )
    prompts.push({
      field: "rendered.description",
      raw: content.promptTemplates.description,
      literal: config.rendered.description,
    });
  // Likewise the Shorts step's two prompts, each only when one is picked.
  for (const [key, name] of [
    ["shorts", config.shorts?.prompt],
    ["shortsImage", config.shorts?.imagePrompt],
  ] as const)
    if (usesShorts(config) && name?.trim() && content.promptTemplates[key] != null)
      prompts.push({
        field: `rendered.${key}`,
        raw: content.promptTemplates[key] ?? null,
        literal: config.rendered[key],
      });
  if (
    (config.sources.article === "generate" && !content.articleEdited) ||
    (config.sources.research === "generate" && config.sources.article !== "provide")
  )
    prompts.push({
      field: "rendered.article",
      raw: content.promptTemplates.article ?? null,
      literal: config.rendered.article,
    });
  for (const category of ["intro", "outro"] as const)
    if (config.sources.audio === "generate" && config[category] !== undefined)
      prompts.push({
        field: `rendered.${category}`,
        raw: content.promptTemplates[category] ?? null,
        literal: config.rendered[category],
      });
  if (config.sources.thumbnail === "from_prompt" || config.sources.thumbnail === "prompt_by_llm")
    prompts.push({
      field: "rendered.thumbnailPrompt",
      raw: content.promptTemplates.thumbnailPrompt ?? null,
      literal: config.rendered.thumbnailPrompt,
    });
  // The establishing image: its prompt is checked like the thumbnail's, an upload must be there.
  if (usesReference(config) && config.reference?.source === "prompt")
    prompts.push({
      field: "rendered.referencePrompt",
      raw: content.promptTemplates.referencePrompt ?? null,
      literal: config.rendered.referencePrompt,
    });
  if (
    usesReference(config) &&
    config.reference?.source === "provide" &&
    content.provided.reference === undefined
  )
    fields.push({
      field: "content.provided.reference",
      message:
        "Upload the establishing image, choose From a prompt instead, or set Establishing image to Off.",
    });
  if (config.sources.images !== "off")
    for (const key of content.imageOrder) {
      const image = content.imageDefinitions[key];
      if (image?.source === "generate")
        prompts.push({
          field: `content.imageDefinitions.${key}.prompt`,
          raw:
            image.templateKey == null ? null : (content.promptTemplates[image.templateKey] ?? null),
          literal: image.prompt ?? undefined,
        });
      else if (image?.source === "provide" && image.assetId === null)
        fields.push({
          field: `content.imageDefinitions.${key}.assetId`,
          message: "Choose an uploaded image.",
        });
    }
  for (const prompt of prompts) {
    if (!(prompt.raw === null ? prompt.literal : render(prompt.raw, config.values))?.trim())
      fields.push({ field: prompt.field, message: "Enter a prompt or text." });
    if (prompt.raw === null) continue;
    const slots = detectSlots(prompt.raw);
    if (slots.errors.length > 0)
      fields.push({ field: prompt.field, message: "Fix the keyword placeholders in this prompt." });
    for (const key of slots.names)
      if (!Object.hasOwn(config.values, key) || !config.values[key]?.trim())
        fields.push({ field: `values.${key}`, message: "Enter a value for this keyword." });
  }
  return fields;
}
