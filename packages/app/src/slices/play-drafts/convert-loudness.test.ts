import { afterEach, expect, it } from "vitest";
import { defaultLoudness, loudnessFields } from "../loudness/model.js";
import { toAdmissionDraft } from "./convert.js";
import { draftFixture } from "./draft.fake.js";
import type { PlayDraftDocument } from "./model.js";

// Level the volume on Play: a draft that never touched it follows Settings → General, which is
// on for a new run; the run carries it only while on, and only with a narration to level.

const fixtures: { close: () => void }[] = [];
afterEach(() => {
  for (const one of fixtures.splice(0)) one.close();
});

function document(form: Partial<PlayDraftDocument["form"]> = {}): PlayDraftDocument {
  const h = draftFixture();
  fixtures.push(h);
  return { ...h.document, form: { ...h.document.form, ...form } };
}

function loudnessOf(value: PlayDraftDocument, settings = defaultLoudness) {
  const converted = toAdmissionDraft({
    document: value,
    attachments: [],
    entries: [],
    silenceGapSeconds: 3,
    loudness: settings,
  });
  if (!converted.ok) throw new Error(JSON.stringify(converted.fields));
  return converted.draft.loudness;
}

it("starts a new run levelled at the recommended volumes", () => {
  expect(loudnessOf(document())).toEqual({ videoLufs: -14, audioFilesLufs: -18 });
});

it("follows Settings → General for a draft that did not change it", () => {
  expect(loudnessOf(document(), { ...defaultLoudness, enabled: false })).toBeUndefined();
  expect(loudnessOf(document(), { enabled: true, videoLufs: -16, audioFilesLufs: -20 })).toEqual({
    videoLufs: -16,
    audioFilesLufs: -20,
  });
});

it("keeps the draft's own choice over Settings'", () => {
  expect(loudnessOf(document({ loudness: { enabled: false } }))).toBeUndefined();
  expect(
    loudnessOf(document({ loudness: { enabled: true, videoLufs: -12 } }), {
      ...defaultLoudness,
      enabled: false,
    }),
  ).toEqual({ videoLufs: -12, audioFilesLufs: -18 });
});

it("leaves it off a run with no narration", () => {
  const silent = document();
  expect(
    loudnessOf({
      ...silent,
      form: { ...silent.form, sources: { ...silent.form.sources, audio: "off" } },
    }),
  ).toBeUndefined();
});

it("refuses a volume outside the control's range, in words", () => {
  expect(loudnessFields({ videoLufs: -30, audioFilesLufs: -18 })).toEqual([
    {
      field: "loudness.videoLufs",
      message: expect.stringContaining(
        "between -10 dB and +4 dB of the recommended level, in steps of 0.5 dB. Change it under Level the volume",
      ),
    },
  ]);
  expect(loudnessFields({ videoLufs: -10, audioFilesLufs: -22.5 })).toEqual([]);
});
