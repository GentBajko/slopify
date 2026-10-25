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
      useNarrationAliases: true,
      describeFigures: true,
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
    showFigures: true,
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
  // A draft made from a template only: a saved voice of a voice service that answers, with that
  // service's first model, for a template whose own voice service can't read here (no key
  // saved), and the voice services that do answer, whose pick is kept.
  readonly audio?:
    | { readonly provider: string; readonly model: string; readonly voice: string }
    | undefined;
  readonly voiceServices?: readonly string[] | undefined;
}
let providerDefaults: FreshProviderDefaults = {};
export function setFreshProviderDefaults(defaults: FreshProviderDefaults): void {
  providerDefaults = defaults;
}
// The first writer and image service that answers (a key saved, a tool installed), each with
// its first listed model: what a draft made from a template takes for a kind the first launch
// found nothing of, so keys entered in Settings count as found too. With them, the voice a
// template-made draft reads with when the template's voice service has no key here.
let readyServices: FreshProviderDefaults = {};
export function setReadyServices(ready: FreshProviderDefaults): void {
  readyServices = ready;
}
// What a draft made from a template takes where the template names no writer or image
// service: what the first launch found, else the ready service of that kind.
export function templateProviderDefaults(
  found: FreshProviderDefaults = providerDefaults,
): FreshProviderDefaults {
  return {
    llm: found.llm ?? readyServices.llm,
    images: found.images ?? readyServices.images,
    audio: readyServices.audio,
    voiceServices: readyServices.voiceServices,
  };
}
// A writer or image service nobody has picked takes the default; one already picked is left
// alone, and so is a document with nothing to fill (the same object comes back). The one voice
// of a narrated draft takes the default voice when its service is empty or can't read here; a
// draft with speakers keeps each speaker's own.
export function withProviderDefaults(
  document: PlayDraftDocument,
  defaults: FreshProviderDefaults = providerDefaults,
): PlayDraftDocument {
  const { form } = document;
  const llm = form.llm.provider === "" ? defaults.llm : undefined;
  const images = form.images.provider === "" ? defaults.images : undefined;
  const reads = defaults.voiceServices ?? [];
  const audio =
    form.sources.audio === "generate" &&
    form.voices === undefined &&
    (form.audio.provider === "" || !reads.includes(form.audio.provider))
      ? defaults.audio
      : undefined;
  if (llm === undefined && images === undefined && audio === undefined) return document;
  return {
    ...document,
    form: {
      ...form,
      ...(llm === undefined ? {} : { llm: { ...llm } }),
      ...(images === undefined ? {} : { images: { ...images } }),
      ...(audio === undefined ? {} : { audio: { ...form.audio, ...audio } }),
    },
  };
}

export function normalizePlayForm(form: PlayDraftForm): PlayDraftForm {
  const sources = {
    ...form.sources,
    ...(form.sources.article !== "generate" ? { research: "off" as const } : {}),
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
