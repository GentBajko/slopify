import { expect, it } from "vitest";
import { defaultVideoEdit, videoCodecs } from "../video/edit-settings.js";
import { draftFixture } from "./draft.fake.js";
import { playDraftDocumentSchema } from "./schema.js";

it("rejects unknown fields and unsupported versions without coercing draft numbers", () => {
  const h = draftFixture();
  try {
    expect(playDraftDocumentSchema.safeParse({ ...h.document, schemaVersion: 2 }).success).toBe(
      false,
    );
    expect(playDraftDocumentSchema.safeParse({ ...h.document, secret: "no" }).success).toBe(false);
    expect(playDraftDocumentSchema.parse(h.document).form.narrationPrompt).toBeUndefined();
    expect(
      playDraftDocumentSchema.parse({
        ...h.document,
        form: { ...h.document.form, narrationPrompt: "Documentary" },
      }).form.narrationPrompt,
    ).toBe("Documentary");
    expect(
      playDraftDocumentSchema.parse({ ...h.document, expectedWords: " invalid " }).expectedWords,
    ).toBe(" invalid ");
  } finally {
    h.close();
  }
});

it.each([undefined, false, true])("preserves saved audio preference %s", (preference) => {
  const h = draftFixture();
  try {
    const audio = {
      provider: "inworld",
      model: "inworld-tts-2-flash",
      voice: "v",
      ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
    };
    const document = { ...h.document, form: { ...h.document.form, audio } };
    const parsed = playDraftDocumentSchema.parse(document);
    expect(parsed).toStrictEqual(document);
    expect(Object.hasOwn(parsed.form.audio, "usePronunciationGlossary")).toBe(
      preference !== undefined,
    );
    expect(playDraftDocumentSchema.parse(JSON.parse(JSON.stringify(parsed)))).toStrictEqual(
      document,
    );
  } finally {
    h.close();
  }
});

it("rejects malformed glossary preferences without loosening the strict audio shape", () => {
  const h = draftFixture();
  try {
    for (const usePronunciationGlossary of [null, "true", "false", 0, 1, {}, []]) {
      expect(
        playDraftDocumentSchema.safeParse({
          ...h.document,
          form: {
            ...h.document.form,
            audio: { ...h.document.form.audio, usePronunciationGlossary },
          },
        }).success,
      ).toBe(false);
    }
    expect(
      playDraftDocumentSchema.safeParse({
        ...h.document,
        form: { ...h.document.form, audio: { ...h.document.form.audio, unexpected: true } },
      }).success,
    ).toBe(false);
  } finally {
    h.close();
  }
});
it("reads a draft saved before the video timing controls with their defaults", () => {
  const h = draftFixture();
  try {
    const {
      imageSeconds: _image,
      edgeSilenceSeconds: _edge,
      zoomPercent: _zoom,
      motionStyle: _motion,
      ...form
    } = h.document.form;
    const parsed = playDraftDocumentSchema.parse({ ...h.document, form });
    expect(parsed.form.imageSeconds).toBe("15");
    expect(parsed.form.edgeSilenceSeconds).toBe("2");
    expect(parsed.form.zoomPercent).toBe("22.5");
    expect(parsed.form.motionStyle).toBe("zoom");
  } finally {
    h.close();
  }
});
// A template is a saved draft (`project-templates/schema.ts`), so this is also what Save on the
// template editor and the MCP's update_template accept.
it("accepts the video codec in the video edit settings, and nothing but the three codecs", () => {
  const h = draftFixture();
  try {
    const withCodec = (codec: unknown) => ({
      ...h.document,
      form: { ...h.document.form, videoEdit: { ...defaultVideoEdit, codec } },
    });
    for (const codec of videoCodecs)
      expect(playDraftDocumentSchema.parse(withCodec(codec)).form.videoEdit?.codec).toBe(codec);
    expect(playDraftDocumentSchema.safeParse(withCodec("vp9")).success).toBe(false);
    // Absent is H.264, as every video before it was.
    expect(
      playDraftDocumentSchema.parse({
        ...h.document,
        form: { ...h.document.form, videoEdit: defaultVideoEdit },
      }).form.videoEdit?.codec,
    ).toBeUndefined();
  } finally {
    h.close();
  }
});
