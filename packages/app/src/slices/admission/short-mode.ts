import type { RunDraft } from "./model.js";
import { sourceOf } from "./model.js";
import type { FieldError } from "./rules.js";

// The short-only run mode: the same stages as a long video, narrowed to one vertical clip of
// about a minute. The article is written for a short, the narration and images are made as
// usual, and the Video stage renders the whole narration through the Shorts renderer
// (`shorts/render.ts`) with its word-by-word captions instead of the slideshow. A short has
// no thumbnail, PDF or shorts of its own.

export function usesShortMode(draft: Pick<RunDraft, "mode">): boolean {
  return draft.mode === "short";
}

// Said where each control sits, so a draft or a Save that breaks the mode names the fix.
export function shortModeFields(
  draft: Pick<RunDraft, "mode" | "format" | "sources" | "shorts">,
): readonly FieldError[] {
  if (!usesShortMode(draft)) return [];
  const fields: FieldError[] = [];
  if (draft.format !== "9:16")
    fields.push({
      field: "format",
      message: "A short is vertical. Choose the 9:16 format, or make a long video instead.",
    });
  if (sourceOf(draft.sources, "video") !== "generate")
    fields.push({
      field: "sources.video",
      message: "A short is a video. Set Video to Generate.",
    });
  if (sourceOf(draft.sources, "audio") === "off")
    fields.push({
      field: "sources.audio",
      message:
        "A short's length and captions come from its narration. Set Narration to Generate or Provide.",
    });
  if (sourceOf(draft.sources, "images") === "off")
    fields.push({
      field: "sources.images",
      message: "A short shows images behind its captions. Set Images to Generate or Provide.",
    });
  for (const kind of ["thumbnail", "document"] as const)
    if (sourceOf(draft.sources, kind) !== "off")
      fields.push({
        field: `sources.${kind}`,
        message: `A short has no ${kind === "thumbnail" ? "thumbnail" : "PDF"}. Set ${kind === "thumbnail" ? "Thumbnail" : "Document"} to Off.`,
      });
  if (draft.shorts?.enabled === true)
    fields.push({
      field: "shorts.enabled",
      message: "A short isn't cut into more shorts. Turn Shorts off.",
    });
  return fields;
}
