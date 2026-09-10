import type { RunConfig } from "../admission/model.js";
import type { FieldError } from "../admission/rules.js";
import { detectSlots, render } from "../admission/substitute.js";
import type { RevisionContent } from "../revisions/model.js";

export function validateRecipeInputs(
  config: RunConfig,
  content: RevisionContent,
): readonly FieldError[] {
  const fields: FieldError[] = [];
  const llm =
    (config.sources.research === "generate" && config.sources.article !== "provide") ||
    (config.sources.article === "generate" && !content.articleEdited) ||
    config.sources.thumbnail === "prompt_by_llm" ||
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
      config.sources.thumbnail === "prompt_by_llm") &&
    (!config.images?.provider.trim() || !config.images.model.trim())
  )
    fields.push({ field: "images", message: "Pick an image provider and model." });
  if (content.imageOrder.length > 60)
    fields.push({ field: "content.imageOrder", message: "Keep at most 60 images." });
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
