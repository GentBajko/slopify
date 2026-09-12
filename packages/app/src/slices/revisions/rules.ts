import { isDeepStrictEqual } from "node:util";
import type { FieldError } from "../admission/rules.js";
import { buildRecipes } from "../rebuild/recipe-build.js";
import { normalizeArticleIntent } from "../rebuild/recipe-save.js";
import type { ManualCue, RevisionEdit, RevisionView } from "./model.js";

export function validateCues(cues: readonly ManualCue[], duration: number): readonly FieldError[] {
  const fields: FieldError[] = [];
  const seen = new Set<string>();
  let end = 0;
  for (const [index, cue] of cues.entries()) {
    const field = `content.subtitleCues.cues.${index}`;
    if (seen.has(cue.id))
      fields.push({ field: `${field}.id`, message: "Caption IDs must be unique." });
    seen.add(cue.id);
    if (cue.text.trim() === "")
      fields.push({ field: `${field}.text`, message: "Caption text is required." });
    if (!Number.isFinite(cue.start) || cue.start < end)
      fields.push({ field: `${field}.start`, message: "Start must follow the previous caption." });
    if (!Number.isFinite(cue.end) || cue.end <= cue.start || cue.end > duration)
      fields.push({
        field: `${field}.end`,
        message: "End must follow start and fit the narration.",
      });
    end = cue.end;
  }
  return fields;
}

export function validateTemplateIntent(
  base: RevisionView,
  edit: RevisionEdit,
): readonly FieldError[] {
  const fields: FieldError[] = [];
  if (!isDeepStrictEqual(base.revision.config.values, edit.config.values)) {
    for (const [key, raw] of Object.entries(base.revision.content.promptTemplates)) {
      if (
        raw === null &&
        edit.content.promptTemplates[key] == null &&
        base.revision.config.rendered[key] === edit.config.rendered[key]
      )
        fields.push({
          field: `content.promptTemplates.${key}`,
          message:
            "Choose the raw template or explicitly keep the current prompt before changing keywords.",
        });
    }
    for (const [key, image] of Object.entries(base.revision.content.imageDefinitions)) {
      const next = edit.content.imageDefinitions[key];
      if (
        image.source === "generate" &&
        image.templateKey == null &&
        next?.source === "generate" &&
        next.templateKey == null &&
        next.prompt === image.prompt
      )
        fields.push({
          field: `content.imageDefinitions.${key}.templateKey`,
          message:
            "Choose the raw template or explicitly keep the current image prompt before changing keywords.",
        });
    }
  }
  for (const [key, image] of Object.entries(edit.content.imageDefinitions))
    if (
      image.source === "generate" &&
      image.templateKey != null &&
      edit.content.promptTemplates[image.templateKey] == null &&
      !(
        base.revision.content.promptTemplates[image.templateKey] == null &&
        isDeepStrictEqual(base.revision.content.imageDefinitions[key], image)
      )
    )
      fields.push({
        field: `content.imageDefinitions.${key}.templateKey`,
        message: "The linked raw image template is missing.",
      });
  return fields;
}

export function validateNarrationIntent(
  base: RevisionView,
  edit: RevisionEdit,
): readonly FieldError[] {
  const recipes = buildRecipes({
    config: edit.config,
    content: normalizeArticleIntent(base, edit),
    manifest: {
      outputs: base.outputs.filter((row) => row.selected),
      pieces: base.pieces.filter((row) => row.selected),
    },
    resolved: {
      articleMarkdown: base.articleMarkdown,
      researchNotes: edit.config.provided.research ?? null,
    },
  });
  const keys = new Set(
    recipes.flatMap((row) =>
      row.input.kind === "tts"
        ? [row.input.logicalKey]
        : row.stage === "audio" && row.key.endsWith(":1")
          ? [row.key.slice(0, -2)]
          : [],
    ),
  );
  const fields: FieldError[] = [];
  for (const [key, value] of Object.entries(edit.content.narrationOverrides))
    if (!isDeepStrictEqual(value, base.revision.content.narrationOverrides[key]) && !keys.has(key))
      fields.push({
        field: `content.narrationOverrides.${key}`,
        message: "Choose an active narration group or entry.",
      });
  for (const [index, upload] of (edit.uploads ?? []).entries())
    if (upload.destination.kind === "narration" && !keys.has(upload.destination.key))
      fields.push({
        field: `uploads.${index}.destination.key`,
        message: "Choose an active narration group or entry.",
      });
  return fields;
}
