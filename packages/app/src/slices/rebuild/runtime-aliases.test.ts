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
const dialogueCatalogue = {
  ...catalogue,
  providers: { ...catalogue.providers, elevenlabs: { maxConcurrent: 5 } },
  tts: [
    ...catalogue.tts,
    ...catalogue.tts.map((row) => ({ ...row, provider: "elevenlabs", id: "eleven_v3" })),
  ],
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

it("reads aliases in every line of a native multi-speaker request", async () => {
  const source = "Alex: Dr. Grey is here.\n\nSam: And so is Ms. Plum.";
  const eleven = { provider: "elevenlabs", model: "eleven_v3" };
  const h = await narrationFixture(source, {
    config: {
      audio: { provider: "openai-tts", model: "tts", voice: "voice", useNarrationAliases: true },
      narrationAliases: [
        { written: "Dr.", spoken: "Doctor", wholeWord: true, caseSensitive: false },
        { written: "Ms. Plum", spoken: "Miss Plum", wholeWord: true, caseSensitive: false },
      ],
      voices: {
        format: "podcast",
        source: "script",
        speakers: [
          { id: "alex", name: "Alex", role: "host", voice: { ...eleven, voice: "x" } },
          { id: "sam", name: "Sam", role: "host", voice: { ...eleven, voice: "y" } },
        ],
        turnGapSeconds: 0.35,
        nameTags: false,
        nativeDialogue: true,
        audioFiles: false,
      },
    },
    catalogue: dialogueCatalogue,
  });
  try {
    await h.pump();
    const spoken = h.calls.filter((call) => call.kind === "tts" && call.dialogue !== undefined);
    // Each line of the one request is aliased on its own; the voice gets no written form.
    expect(spoken.map((call) => call.dialogue)).toEqual([
      ["Doctor Grey is here.", "And so is Miss Plum."],
    ]);
    expect(spoken[0]?.text).toBe("Doctor Grey is here.\nAnd so is Miss Plum.");
    const view = h.view();
    const plan = executionPlan(h.deps, view, dialogueCatalogue);
    expect(plan.work.some((row) => row.disposition === "blocked")).toBe(false);
    // The transcript keeps the script's own wording.
    expect(revisionTranscript(h.deps, { view, plan }, "body")).toBe(
      "Dr. Grey is here.\nAnd so is Ms. Plum.",
    );
  } finally {
    h.close();
  }
});
