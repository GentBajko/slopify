import { expect, it } from "vitest";
import type { RunDraft } from "./model.js";
import { usesPronunciationGlossary } from "./rules.js";

const sources: RunDraft["sources"] = {
  research: "off",
  article: "provide",
  audio: "generate",
  images: "off",
  thumbnail: "off",
  video: "off",
};
it.each([undefined, false, true])("gates the stored preference %s without changing it", (flag) => {
  for (const source of ["generate", "provide", "off"] as const) {
    for (const model of ["inworld-tts-2", "inworld-tts-2-flash", "other"]) {
      for (const provider of ["inworld", "other"]) {
        const draft = {
          sources: { ...sources, audio: source },
          audio: {
            provider,
            model,
            voice: "v",
            ...(flag === undefined ? {} : { usePronunciationGlossary: flag }),
          },
        };
        const before = JSON.stringify(draft);
        expect(usesPronunciationGlossary(draft)).toBe(
          flag === true && source === "generate" && provider === "inworld" && model !== "other",
        );
        expect(JSON.stringify(draft)).toBe(before);
      }
    }
  }
  expect(usesPronunciationGlossary({ sources })).toBe(false);
});
