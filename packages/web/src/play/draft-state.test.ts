import { describe, expect, it } from "vitest";
import {
  admissionOf,
  freshDraftDocument,
  normalizePlayForm,
  parseDraftDocument,
  serializeDraftDocument,
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
