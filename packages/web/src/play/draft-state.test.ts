import { describe, expect, it } from "vitest";
import {
  admissionOf,
  freshDraftDocument,
  normalizePlayForm,
  parseDraftDocument,
  serializeDraftDocument,
  setFreshProviderDefaults,
  setReadyServices,
  templateProviderDefaults,
  withProviderDefaults,
} from "./draft-state";

const id = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const freshForm = freshDraftDocument.form;

it("matches the shared initial draft defaults", () => {
  expect(freshDraftDocument).toMatchObject({
    schemaVersion: 1,
    section: "content",
    variants: [],
    expectedWords: "1500",
    previewText: "Every story begins with a word.",
    fontUpload: null,
    form: {
      format: "16:9",
      audio: { usePronunciationGlossary: true },
      chunking: { mode: "whole", words: "500", characters: "3000" },
      subtitles: { fontSize: "48", mode: "off", fontId: "default", position: "bottom" },
    },
  });
});

describe("saved source normalization", () => {
  it("persists the same inactive sources the visible controls display", () => {
    const form = {
      ...freshForm,
      sources: {
        ...freshForm.sources,
        article: "provide" as const,
        research: "generate" as const,
        images: "off" as const,
        audio: "off" as const,
      },
      values: { unused: "kept for reactivation" },
      subtitles: { ...freshForm.subtitles, mode: "burn-in" as const },
    };
    const saved = normalizePlayForm(form);
    expect(saved.sources).toMatchObject({ research: "off", video: "off", audio: "off" });
    expect(saved.subtitles.mode).toBe("off");
    expect(saved.values).toEqual({ unused: "kept for reactivation" });
    expect(form.sources.research).toBe("generate");
  });
  it("keeps sidecar subtitles when only video is off", () => {
    expect(
      normalizePlayForm({
        ...freshForm,
        sources: { ...freshForm.sources, video: "off" },
        subtitles: { ...freshForm.subtitles, mode: "burn-in" },
      }).subtitles.mode,
    ).toBe("files");
  });
});

it("round trips incomplete forms and dormant values without coercion or trimming", () => {
  const document = {
    ...freshDraftDocument,
    form: {
      ...freshForm,
      title: "  ",
      narrationPrompt: "  Retained Delivery  ",
      values: { unused: "  remembered  " },
      imagePrompts: [{ name: "", number: "-" }],
      chunking: { mode: "words" as const, words: "", characters: "oops" },
      subtitles: { ...freshForm.subtitles, fontSize: "" },
    },
    expectedWords: "",
  };
  expect(parseDraftDocument(JSON.parse(serializeDraftDocument(document)))).toEqual({
    ok: true,
    document,
  });
  expect(parseDraftDocument(JSON.parse(serializeDraftDocument(freshDraftDocument)))).toEqual({
    ok: true,
    document: freshDraftDocument,
  });
});
it("round trips attachment order and variant identities", () => {
  const document = {
    ...freshDraftDocument,
    form: {
      ...freshForm,
      provided: {
        ...freshForm.provided,
        images: [
          { attachmentId: secondId, name: "b.png" },
          { attachmentId: id, name: "a.png" },
        ],
      },
    },
    variants: [
      { id: secondId, title: "Second", values: { hidden: "kept" } },
      { id, title: "First", values: {} },
    ],
  };
  expect(parseDraftDocument(JSON.parse(serializeDraftDocument(document)))).toEqual({
    ok: true,
    document,
  });
});
it("rejects unknown fields and browser objects before serializing", () => {
  for (const extra of [new Blob(["x"]), new File(["x"], "x.txt"), "unknown"]) {
    expect(() => serializeDraftDocument({ ...freshDraftDocument, extra })).toThrow();
    expect(() =>
      serializeDraftDocument({
        ...freshDraftDocument,
        form: { ...freshForm, provided: { ...freshForm.provided, audio: extra } },
      }),
    ).toThrow();
  }
});
it("keeps unsupported documents recoverable without resetting them", () => {
  expect(parseDraftDocument({ ...freshDraftDocument, schemaVersion: 2 })).toMatchObject({
    ok: false,
  });
  expect(parseDraftDocument(null)).toMatchObject({ ok: false });
});
it("uses shared admission numeric validation only at admission", () => {
  const document = {
    ...freshDraftDocument,
    form: { ...freshForm, chunking: { mode: "words" as const, words: "", characters: "3000" } },
  };
  expect(
    admissionOf({ document, attachments: [], entries: [], silenceGapSeconds: 0 }),
  ).toMatchObject({
    ok: false,
    fields: expect.arrayContaining([{ field: "chunking.words", message: expect.any(String) }]),
  });
});

it.each([undefined, false, true])(
  "round trips saved pronunciation preference %s without applying fresh defaults",
  (preference) => {
    const audio = {
      provider: "cartesia",
      model: "sonic-3.5",
      voice: "v",
      ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
    };
    const document = {
      ...freshDraftDocument,
      form: { ...freshDraftDocument.form, audio },
    };
    const parsed = parseDraftDocument(JSON.parse(serializeDraftDocument(document)));
    expect(parsed).toStrictEqual({ ok: true, document });
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fields));
    expect(Object.hasOwn(parsed.document.form.audio, "usePronunciationGlossary")).toBe(
      preference !== undefined,
    );
    const admitted = admissionOf({
      document: parsed.document,
      attachments: [],
      entries: [],
      silenceGapSeconds: 0,
    });
    if (!admitted.ok) throw new Error(JSON.stringify(admitted.fields));
    // With the glossary on, a draft saved before the sharing switch shares, as Play shows it.
    expect(admitted.draft.audio).toStrictEqual(
      preference === true ? { ...audio, shareGlossary: true } : audio,
    );
    for (const source of ["off", "provide"] as const) {
      const dormant = {
        ...document,
        form: { ...document.form, sources: { ...document.form.sources, audio: source } },
      };
      const restored = parseDraftDocument(JSON.parse(serializeDraftDocument(dormant)));
      if (!restored.ok) throw new Error(JSON.stringify(restored.fields));
      expect(restored.document.form.audio).toStrictEqual(audio);
    }
  },
);

describe("the services a new or template-made draft starts with", () => {
  const defaults = {
    llm: { provider: "claude-code", model: "sonnet" },
    images: { provider: "codex-image", model: "gpt-image" },
  };
  it("fills each service nobody picked, and leaves a picked one alone", () => {
    const writer = { ...freshDraftDocument.form, llm: { provider: "openrouter", model: "x" } };
    const filled = withProviderDefaults({ ...freshDraftDocument, form: writer }, defaults);
    expect(filled.form.llm).toEqual({ provider: "openrouter", model: "x" });
    expect(filled.form.images).toEqual(defaults.images);
    expect(withProviderDefaults(freshDraftDocument, defaults).form.llm).toEqual(defaults.llm);
  });
  it("hands back the same document when there is nothing to fill", () => {
    const picked = {
      ...freshDraftDocument,
      form: {
        ...freshDraftDocument.form,
        llm: { provider: "openrouter", model: "x" },
        images: { provider: "fal", model: "y" },
      },
    };
    expect(withProviderDefaults(picked, defaults)).toBe(picked);
    expect(withProviderDefaults(freshDraftDocument, {})).toBe(freshDraftDocument);
  });
  it("gives the one voice a voice that reads when its service can't, and keeps one that can", () => {
    const reader = { provider: "cartesia", model: "sonic-3.5", voice: "c1" };
    const narrated = {
      ...freshDraftDocument,
      form: {
        ...freshDraftDocument.form,
        audio: { ...freshDraftDocument.form.audio, provider: "openai-tts", model: "m", voice: "v" },
      },
    };
    const swapped = withProviderDefaults(narrated, { audio: reader, voiceServices: ["cartesia"] });
    expect(swapped.form.audio).toMatchObject(reader);
    // The glossary and the other voice settings stay as they were.
    expect(swapped.form.audio.usePronunciationGlossary).toBe(true);
    const reads = { audio: reader, voiceServices: ["cartesia", "openai-tts"] };
    expect(withProviderDefaults(narrated, reads)).toBe(narrated);
    // Speakers keep their own voices, and a silent draft needs none.
    const silent = {
      ...narrated,
      form: { ...narrated.form, sources: { ...narrated.form.sources, audio: "off" as const } },
    };
    expect(withProviderDefaults(silent, { audio: reader, voiceServices: [] })).toBe(silent);
  });
  it("gives a template-made draft what the first launch found, else the service whose key is saved", () => {
    const keyed = {
      llm: { provider: "openrouter", model: "google/gemini-3.8-flash" },
      images: { provider: "fal", model: "fal-ai/flux-2" },
    };
    setReadyServices(keyed);
    setFreshProviderDefaults({ llm: defaults.llm });
    try {
      expect(templateProviderDefaults()).toEqual({ llm: defaults.llm, images: keyed.images });
      expect(templateProviderDefaults(defaults)).toEqual(defaults);
    } finally {
      setReadyServices({});
      setFreshProviderDefaults({});
    }
  });
});
