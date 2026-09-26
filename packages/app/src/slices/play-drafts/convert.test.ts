import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type { Entry } from "../library/model.js";
import { toAdmissionDraft } from "./convert.js";
import { draftFixture } from "./draft.fake.js";
import type { DraftAttachment, PlayDraftDocument } from "./model.js";

function convert(
  document: PlayDraftDocument,
  attachments: readonly DraftAttachment[] = [],
  entries: readonly Entry[] = [],
) {
  return toAdmissionDraft({ document, attachments, entries, silenceGapSeconds: 7 });
}
it("normalizes inactive sources and ignores their unfinished controls without changing the document", () => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: {
          ...h.document.form.sources,
          article: "provide" as const,
          audio: "off" as const,
          images: "off" as const,
        },
        imagePrompts: [{ name: "Old", number: "invalid" }],
        chunking: { mode: "words" as const, words: "", characters: "oops" },
        subtitles: {
          ...h.document.form.subtitles,
          mode: "burn-in" as const,
          fontSize: "",
          fontId: "",
        },
        intro: "Missing",
      },
    };
    const before = JSON.stringify(document);
    const result = convert(document);
    expect(result).toMatchObject({
      ok: true,
      draft: {
        sources: { research: "off", video: "off" },
        imagePrompts: [],
        chunking: { mode: "whole" },
        subtitles: { mode: "off", fontSize: 48 },
        silenceGapSeconds: 7,
      },
    });
    expect(JSON.stringify(document)).toBe(before);
  } finally {
    h.close();
  }
});
it.each(["", "abc", "0", "1.5", "1000001"])("rejects active chunk count %j", (raw) => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        chunking: { mode: "characters" as const, words: "", characters: raw },
      },
    };
    expect(convert(document)).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([
        { field: "chunking.characters", message: expect.any(String) },
      ]),
    });
  } finally {
    h.close();
  }
});
it("requires exact ready owned upload metadata at every provided slot", () => {
  const h = draftFixture();
  try {
    const file = { attachmentId: randomUUID(), name: "image.png" };
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: {
          ...h.document.form.sources,
          audio: "provide" as const,
          images: "provide" as const,
          thumbnail: "provide" as const,
        },
        provided: { ...h.document.form.provided, audio: file, images: [file], thumbnail: file },
      },
    };
    const missing = convert(document);
    expect(missing).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([
        expect.objectContaining({ field: "provided.audio" }),
        expect.objectContaining({ field: "provided.images.0" }),
        expect.objectContaining({ field: "provided.thumbnail" }),
      ]),
    });
    const attachment: DraftAttachment = {
      id: file.attachmentId,
      kind: "images",
      name: file.name,
      state: "ready",
      stagedFileId: "staged",
      bytes: 3,
      error: null,
    };
    const imagesOnly = {
      ...document,
      form: {
        ...document.form,
        sources: { ...document.form.sources, audio: "off" as const, thumbnail: "off" as const },
      },
    };
    expect(convert(imagesOnly, [attachment])).toMatchObject({
      ok: true,
      draft: { provided: { images: ["staged"] } },
    });
    for (const state of ["pending", "copying", "reattach"] as const)
      expect(convert(imagesOnly, [{ ...attachment, state }])).toMatchObject({ ok: false });
  } finally {
    h.close();
  }
});
it("uses saved entry mode and reports deleted active entries", () => {
  const h = draftFixture();
  try {
    const document = { ...h.document, form: { ...h.document.form, intro: "Opening" } };
    expect(convert(document)).toMatchObject({
      ok: false,
      fields: [{ field: "intro", message: expect.any(String) }],
    });
    expect(
      convert(
        document,
        [],
        [
          {
            id: "entry",
            name: "Opening",
            category: "intro",
            mode: "llm",
            body: "Welcome",
            slots: [],
            updatedAt: "today",
          },
        ],
      ),
    ).toMatchObject({ ok: true, draft: { intro: { name: "Opening", mode: "llm" } } });
  } finally {
    h.close();
  }
});

it.each([
  ["image", "0", "imagePrompts.0.number"],
  ["image", "21", "imagePrompts.0.number"],
  ["font", "15", "subtitles.fontSize"],
  ["font", "121", "subtitles.fontSize"],
  ["words", "", "chunking.words"],
  ["words", "1.5", "chunking.words"],
  ["words", "10001", "chunking.words"],
])("checks active %s value %s", (control, raw, field) => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        imagePrompts: [{ name: "Cover", number: control === "image" ? raw : "1" }],
        chunking: {
          mode: "words" as const,
          words: control === "words" ? raw : "500",
          characters: "",
        },
        subtitles: {
          ...h.document.form.subtitles,
          mode: "files" as const,
          fontSize: control === "font" ? raw : "48",
        },
      },
    };
    expect(convert(document)).toMatchObject({
      ok: false,
      fields: expect.arrayContaining([expect.objectContaining({ field })]),
    });
  } finally {
    h.close();
  }
});
it("retains active provider and research controls and downgrades captions for audio export", () => {
  const h = draftFixture();
  try {
    const document = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: {
          ...h.document.form.sources,
          research: "provide" as const,
          images: "off" as const,
          thumbnail: "prompt_by_llm" as const,
        },
        subtitles: { ...h.document.form.subtitles, mode: "burn-in" as const },
        provided: { ...h.document.form.provided, research: "Notes" },
        thumbnailPrompt: "Cover",
        imagePrompts: [{ name: "Old", number: "" }],
      },
    };
    expect(convert(document)).toMatchObject({
      ok: true,
      draft: {
        sources: {
          research: "provide",
          article: "generate",
          images: "off",
          thumbnail: "prompt_by_llm",
          video: "off",
        },
        provided: { research: "Notes" },
        thumbnailPrompt: "Cover",
        subtitles: { mode: "files" },
      },
    });
  } finally {
    h.close();
  }
});

it.each([undefined, false, true])(
  "preserves explicit pronunciation preferences through every audio source: %s",
  (preference) => {
    const h = draftFixture();
    try {
      const audio = {
        provider: "cartesia",
        model: "sonic-3.5",
        voice: "v",
        ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
      };
      const attachment: DraftAttachment = {
        id: randomUUID(),
        kind: "audio",
        name: "narration.wav",
        state: "ready",
        stagedFileId: "staged-audio",
        bytes: 3,
        error: null,
      };
      for (const source of ["generate", "off", "provide"] as const) {
        const document: PlayDraftDocument = {
          ...h.document,
          form: {
            ...h.document.form,
            audio,
            sources: { ...h.document.form.sources, audio: source },
            provided: {
              ...h.document.form.provided,
              audio: { attachmentId: attachment.id, name: attachment.name },
            },
          },
        };
        const before = JSON.stringify(document);
        const result = convert(document, [attachment]);
        if (!result.ok) throw new Error(JSON.stringify(result.fields));
        expect(result.draft.audio).toStrictEqual(
          source === "generate" || preference !== undefined
            ? preference === true
              ? { ...audio, shareGlossary: true }
              : audio
            : undefined,
        );
        expect(result.draft.provided.audio).toBe(source === "provide" ? "staged-audio" : undefined);
        expect(JSON.stringify(document)).toBe(before);
      }
    } finally {
      h.close();
    }
  },
);
it.each([
  [
    "imageSeconds",
    ["", "abc", "0", "1.5", "601"],
    "Enter a whole number of seconds between 1 and 600.",
  ],
  [
    "zoomPercent",
    ["", "-1", "10.25", "51"],
    "Enter a zoom between 0 and 50 percent, in steps of 0.5.",
  ],
  [
    "edgeSilenceSeconds",
    ["", "-1", "0.25", "31"],
    "Enter a number of seconds between 0 and 30, in steps of 0.5.",
  ],
] as const)("refuses a typed %s the run uses with the rule's sentence", (field, raws, message) => {
  const h = draftFixture();
  try {
    for (const raw of raws) {
      const result = convert({ ...h.document, form: { ...h.document.form, [field]: raw } });
      expect(result).toMatchObject({
        ok: false,
        fields: expect.arrayContaining([{ field, message }]),
      });
    }
  } finally {
    h.close();
  }
});
it("carries the timing settings as numbers and ignores ones the run does not use", () => {
  const h = draftFixture();
  try {
    const typed = {
      ...h.document.form,
      imageSeconds: " 20 ",
      edgeSilenceSeconds: "1.5",
      zoomPercent: "0",
      motionStyle: "pan" as const,
    };
    expect(convert({ ...h.document, form: typed })).toMatchObject({
      ok: true,
      draft: { imageSeconds: 20, edgeSilenceSeconds: 1.5, zoomPercent: 0, motionStyle: "pan" },
    });
    const unused = {
      ...h.document.form,
      sources: { ...h.document.form.sources, audio: "off" as const, images: "off" as const },
      imageSeconds: "",
      edgeSilenceSeconds: "oops",
      zoomPercent: "",
    };
    expect(convert({ ...h.document, form: unused })).toMatchObject({
      ok: true,
      draft: { imageSeconds: 15, edgeSilenceSeconds: 2, zoomPercent: 22.5 },
    });
  } finally {
    h.close();
  }
});
it("carries the YouTube description switch and prompt only with narration on", () => {
  const h = draftFixture();
  try {
    const on = { ...h.document.form, youtubeDescription: true, descriptionPrompt: "Hooky" };
    const result = convert({ ...h.document, form: on });
    expect(result).toMatchObject({
      ok: true,
      draft: { youtubeDescription: true, descriptionPrompt: "Hooky" },
    });
    const builtIn = convert({ ...h.document, form: { ...on, descriptionPrompt: " " } });
    expect(builtIn.ok && builtIn.draft.descriptionPrompt).toBe(undefined);
    const silent = convert({
      ...h.document,
      form: { ...on, sources: { ...on.sources, audio: "off" as const } },
    });
    expect(silent.ok && silent.draft.youtubeDescription).toBe(undefined);
  } finally {
    h.close();
  }
});

it("saves the document theme outright, Plain for a draft that names none", () => {
  const h = draftFixture();
  try {
    const on = {
      ...h.document.form,
      sources: { ...h.document.form.sources, document: "generate" as const },
    };
    const unnamed = convert({ ...h.document, form: on });
    expect(unnamed.ok && unnamed.draft.document).toEqual({ theme: "plain" });
    // A draft made from a project that still uses the retired DiceMaster keeps it.
    const kept = convert({ ...h.document, form: { ...on, document: { theme: "dicemaster" } } });
    expect(kept.ok && kept.draft.document).toEqual({ theme: "dicemaster" });
  } finally {
    h.close();
  }
});
