import { expect, it } from "vitest";
import type { RunDraft } from "./model.js";
import { runConfigSchema, runDraftSchema } from "./schema.js";

const draft: RunDraft = {
  title: "Pronunciation",
  format: "16:9",
  sources: {
    research: "off",
    article: "provide",
    audio: "generate",
    images: "off",
    thumbnail: "off",
    video: "off",
  },
  imagePrompts: [],
  values: {},
  provided: { article: "Arda." },
  silenceGapSeconds: 0,
  imageSeconds: 15,
  edgeSilenceSeconds: 0,
};

it.each([undefined, false, true])("round trips run audio preference %s", (preference) => {
  const audio = {
    provider: "inworld",
    model: "inworld-tts-2",
    voice: "v",
    ...(preference === undefined ? {} : { usePronunciationGlossary: preference }),
  };
  const input = { ...draft, audio, rendered: {} };
  for (const schema of [runDraftSchema, runConfigSchema]) {
    const parsed = schema.parse(input);
    expect(parsed.audio).toStrictEqual(audio);
    expect(schema.parse(JSON.parse(JSON.stringify(parsed))).audio).toStrictEqual(audio);
    expect(Object.hasOwn(parsed.audio ?? {}, "usePronunciationGlossary")).toBe(
      preference !== undefined,
    );
  }
});

it("does not invent audio or the flag for old configs", () => {
  for (const schema of [runDraftSchema, runConfigSchema]) {
    const parsed = schema.parse({ ...draft, rendered: {} });
    expect(Object.hasOwn(parsed, "audio")).toBe(false);
  }
});

it("rejects non-boolean run preferences", () => {
  for (const usePronunciationGlossary of [null, "true", "false", 0, 1, {}, []]) {
    const input = {
      ...draft,
      rendered: {},
      audio: { provider: "inworld", model: "inworld-tts-2", voice: "v", usePronunciationGlossary },
    };
    expect(runDraftSchema.safeParse(input).success).toBe(false);
    expect(runConfigSchema.safeParse(input).success).toBe(false);
  }
});

it("reads a config saved before the video timing settings with the defaults", () => {
  const { imageSeconds: _image, edgeSilenceSeconds: _edge, ...old } = draft;
  for (const schema of [runDraftSchema, runConfigSchema]) {
    const parsed = schema.parse({ ...old, rendered: {} });
    expect(parsed.imageSeconds).toBe(15);
    expect(parsed.edgeSilenceSeconds).toBe(2);
  }
  expect(runConfigSchema.parse({ ...draft, imageSeconds: 40, rendered: {} }).imageSeconds).toBe(40);
});
