import { expect, it } from "vitest";
import { revisionTranscript } from "./runtime-export-inputs.js";
import { narrationCatalogue, narrationFixture } from "./runtime-narration.fake.js";
import { executionPlan } from "./runtime-plan.js";

const catalogue = {
  ...narrationCatalogue,
  tts: narrationCatalogue.tts.map((row) => ({
    ...row,
    tts: { ...row.tts, maxCharacters: 1000 },
  })),
};

it("reads aliases aloud while captions keep the written words", async () => {
  const source = "Dr. Grey met Ms. Plum.\n\nNothing else.";
  const h = await narrationFixture(source, {
    config: {
      audio: { provider: "openai-tts", model: "tts", voice: "voice", useNarrationAliases: true },
      narrationAliases: [
        { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
        { written: "Ms.", spoken: "Miss", wholeWord: true, caseSensitive: false },
      ],
    },
    catalogue,
  });
  try {
    await h.pump();
    expect(
      h.calls
        .filter((call) => call.kind === "tts")
        .map((call) => call.text)
        .sort(),
    ).toEqual(["Doctor Grey met Miss Plum.", "Nothing else."]);
    const view = h.view();
    const plan = executionPlan(h.deps, view, catalogue);
    expect(plan.work.some((row) => row.disposition === "blocked")).toBe(false);
    // The transcript the captions are timed against is the article's own wording.
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe(
      "Dr. Grey met Ms. Plum.\nNothing else.",
    );
  } finally {
    h.close();
  }
});
