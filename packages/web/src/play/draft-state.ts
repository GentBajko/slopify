import type { FieldError } from "@app/slices/admission/rules.js";
import { toAdmissionDraft } from "@app/slices/play-drafts/convert.js";
import {
  type PlayDraftDocument,
  type PlayDraftForm,
  playDraftDocumentSchema,
} from "@app/slices/play-drafts/schema.js";
import { defaultSubtitles } from "@app/slices/subtitles/model.js";

export type PlayFormState = PlayDraftForm;
export const freshDraftDocument: PlayDraftDocument = playDraftDocumentSchema.parse({
  schemaVersion: 1,
  form: {
    title: "",
    format: "16:9",
    sources: {
      research: "off",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "off",
      video: "generate",
    },
    llm: { provider: "", model: "" },
    audio: { provider: "", model: "", voice: "" },
    images: { provider: "", model: "" },
    articlePrompt: "",
    imagePrompts: [],
    thumbnailPrompt: "",
    intro: "",
    outro: "",
    chunking: { mode: "whole", words: "500", characters: "3000" },
    subtitles: { ...defaultSubtitles, fontSize: "48" },
    values: {},
    provided: { research: "", article: "", audio: null, images: [], thumbnail: null },
  },
  section: "content",
  variants: [],
  expectedWords: "1500",
  previewText: "Every story begins with a word.",
  fontUpload: null,
});

export function normalizePlayForm(form: PlayDraftForm): PlayDraftForm {
  const sources = {
    ...form.sources,
    ...(form.sources.article === "provide" ? { research: "off" as const } : {}),
    ...(form.sources.images === "off" ? { video: "off" as const } : {}),
  };
  const mode =
    sources.audio === "off"
      ? "off"
      : sources.video === "off" && form.subtitles.mode === "burn-in"
        ? "files"
        : form.subtitles.mode;
  return { ...form, sources, subtitles: { ...form.subtitles, mode } };
}

export function parseDraftDocument(
  raw: unknown,
):
  | { readonly ok: true; readonly document: PlayDraftDocument }
  | { readonly ok: false; readonly fields: readonly FieldError[] } {
  const parsed = playDraftDocumentSchema.safeParse(raw);
  return parsed.success
    ? { ok: true, document: parsed.data }
    : {
        ok: false,
        fields: parsed.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      };
}

export function serializeDraftDocument(raw: unknown): string {
  const document = playDraftDocumentSchema.parse(raw);
  return JSON.stringify({ ...document, form: normalizePlayForm(document.form) });
}

export function admissionOf(
  input: Parameters<typeof toAdmissionDraft>[0],
): ReturnType<typeof toAdmissionDraft> {
  return toAdmissionDraft(input);
}
