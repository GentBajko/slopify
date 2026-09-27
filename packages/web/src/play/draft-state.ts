import {
  defaultEdgeSilenceSeconds,
  defaultImageSeconds,
  defaultMotionStyle,
  defaultZoomPercent,
  type FieldError,
} from "@app/slices/admission/rules.js";
import { toAdmissionDraft } from "@app/slices/play-drafts/convert.js";
import {
  type PlayDraftDocument,
  type PlayDraftForm,
  playDraftDocumentSchema,
} from "@app/slices/play-drafts/schema.js";
import { defaultSubtitles } from "@app/slices/subtitles/model.js";
import { defaultVideoEdit } from "@app/slices/video/edit-settings.js";

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
    audio: {
      provider: "",
      model: "",
      voice: "",
      usePronunciationGlossary: true,
      shareGlossary: true,
    },
    images: { provider: "", model: "" },
    articlePrompt: "",
    narrationPrompt: "",
    imagePrompts: [],
    thumbnailPrompt: "",
    intro: "",
    outro: "",
    chunking: { mode: "whole", words: "500", characters: "3000" },
    subtitles: { ...defaultSubtitles, fontSize: "48" },
    imageSeconds: String(defaultImageSeconds),
    edgeSilenceSeconds: String(defaultEdgeSilenceSeconds),
    zoomPercent: String(defaultZoomPercent),
    motionStyle: defaultMotionStyle,
    // A new project follows the narration; a draft saved before this has none and cuts every
    // N seconds as it did.
    videoEdit: defaultVideoEdit,
    values: {},
    provided: { research: "", article: "", audio: null, images: [], thumbnail: null },
  },
  section: "content",
  variants: [],
  expectedWords: "1500",
  previewText: "Every story begins with a word.",
  fontUpload: null,
});

// The providers a new draft starts with: what the first launch found (Claude Code for text,
// Codex for images), written by the server and handed over by the welcome query. Empty until
// then, and on every install that found nothing.
export interface FreshProviderDefaults {
  readonly llm?: { readonly provider: string; readonly model: string } | undefined;
  readonly images?: { readonly provider: string; readonly model: string } | undefined;
}
let providerDefaults: FreshProviderDefaults = {};
export function setFreshProviderDefaults(defaults: FreshProviderDefaults): void {
  providerDefaults = defaults;
}
// A document nobody has picked a provider in gets the defaults; anything else is left alone.
export function withProviderDefaults(
  document: PlayDraftDocument,
  defaults: FreshProviderDefaults = providerDefaults,
): PlayDraftDocument {
  const { form } = document;
  if (form.llm.provider !== "" || form.images.provider !== "") return document;
  if (defaults.llm === undefined && defaults.images === undefined) return document;
  return {
    ...document,
    form: {
      ...form,
      ...(defaults.llm === undefined ? {} : { llm: { ...defaults.llm } }),
      ...(defaults.images === undefined ? {} : { images: { ...defaults.images } }),
    },
  };
}

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
