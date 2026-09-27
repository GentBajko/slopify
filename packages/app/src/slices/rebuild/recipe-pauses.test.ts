import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import type { Speaker, VoicesSettings } from "../voices/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// Pauses between sentences are made in the narration joins. On the run config only while set,
// so every project made before them keeps its fingerprints; set, they change the joins and what
// is timed from them, and never a text-to-speech request.

const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  chunking: { mode: "paragraph" },
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
};

function plan(c: RunConfig, value: RevisionContent = content): readonly ResolvedWorkRecipe[] {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: value.articleMarkdown ?? null, researchNotes: null },
    catalogue,
  });
}
function fingerprints(c: RunConfig, value?: RevisionContent): Readonly<Record<string, string>> {
  return Object.fromEntries(plan(c, value).map((one) => [one.key, one.fingerprint]));
}

describe("pauses between sentences fingerprints", () => {
  const before = fingerprints(narrated);

  it("stay exactly as they were with no pause set, or pauses of 0", () => {
    expect(
      fingerprints({
        ...narrated,
        sentencePauseSeconds: undefined,
        paragraphPauseSeconds: undefined,
      }),
    ).toEqual(before);
    expect(
      fingerprints({ ...narrated, sentencePauseSeconds: 0, paragraphPauseSeconds: 0 }),
    ).toEqual(before);
  });

  it("change the join and what is timed from it, never a text-to-speech request", () => {
    const recipes = plan({ ...narrated, sentencePauseSeconds: 0.4 });
    const on = Object.fromEntries(recipes.map((one) => [one.key, one.fingerprint]));
    const changed = Object.keys(before).filter((key) => on[key] !== before[key]);
    expect(changed.filter((key) => key.startsWith("audio:"))).toEqual(["audio:body:concat"]);
    expect(on["audio:body:concat"]).not.toBe(before["audio:body:concat"]);
    expect(on["subtitles:timing"]).not.toBe(before["subtitles:timing"]);
    const concat = recipes.find((one) => one.key === "audio:body:concat");
    // Paragraph chunking: every piece but the last ends a paragraph.
    expect(concat?.input.kind === "local" && (concat.input.values as unknown[])[2]).toEqual([
      "pauses-v1",
      0.4,
      0,
      ["paragraph", "end"],
    ]);
  });

  it("travel with the levelled join, which paces the pieces the same way", () => {
    const recipes = plan({
      ...narrated,
      sentencePauseSeconds: 0.45,
      loudness: { videoLufs: -14, audioFilesLufs: -18 },
    });
    const level = recipes.find((one) => one.key === "level:body");
    const values = level?.input.kind === "local" ? (level.input.values as unknown[]) : [];
    expect((values[1] as unknown[])[2]).toEqual(["pauses-v1", 0.45, 0, ["paragraph", "end"]]);
  });

  it("leave a multi-voice script's turn gaps to the turn gap", () => {
    const script = "Alex: Welcome to the show. It is good.\n\nSam: Glad to be here.";
    const speaker = (id: string, voice: string): Speaker => ({
      id,
      name: id,
      role: "host",
      voice: { provider: "voice", model: "tts", voice },
    });
    const voices: VoicesSettings = {
      format: "podcast",
      source: "script",
      speakers: [speaker("Alex", "a"), speaker("Sam", "s")],
      turnGapSeconds: 0,
      nameTags: true,
      nativeDialogue: false,
      audioFiles: false,
    };
    const recipes = plan(
      {
        ...narrated,
        sources: { ...narrated.sources, video: "off" },
        provided: { article: script },
        voices,
        sentencePauseSeconds: 0.35,
      },
      { ...content, articleMarkdown: script },
    );
    const concat = recipes.find((one) => one.key === "audio:body:concat");
    expect(concat?.input.kind === "local" && (concat.input.values as unknown[])[2]).toEqual([
      "pauses-v1",
      0.35,
      0,
      ["turn", "end"],
    ]);
  });
});
