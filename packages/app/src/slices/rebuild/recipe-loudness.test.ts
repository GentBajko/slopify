import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import type { Speaker, VoicesSettings } from "../voices/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

// Level the volume adds a levelled join beside each narration join and masters the exports.
// It is on the run config only while on, so every project made before it, and every one with
// it off, keeps its fingerprints; turning it on changes no text-to-speech request, no plain
// join, and nothing read from the word timing (the description, the shorts' pick, the reviews).

const loudness = { videoLufs: -14, audioFilesLufs: -18 } as const;
const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  intro: { mode: "text", text: "Welcome." } as unknown as RunConfig["intro"],
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
  youtubeDescription: true,
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

describe("Level the volume fingerprints", () => {
  const before = fingerprints(narrated);

  it("stay exactly as they were with the setting absent", () => {
    expect(fingerprints({ ...narrated, loudness: undefined })).toEqual(before);
    expect(Object.keys(before).some((key) => key.startsWith("level:"))).toBe(false);
  });

  it("stay as they were with no narration to level", () => {
    const silent: RunConfig = {
      ...config,
      sources: { ...config.sources, audio: "off" },
    };
    expect(fingerprints({ ...silent, loudness })).toEqual(fingerprints(silent));
  });

  it("add a levelled join per segment and change only the exports", () => {
    const on = fingerprints({ ...narrated, loudness });
    const added = Object.keys(on).filter((key) => !(key in before));
    expect(added.sort()).toEqual(["level:body", "level:intro"]);
    const changed = Object.keys(before).filter((key) => on[key] !== before[key]);
    expect(changed).toEqual(["export:video"]);
    // No text-to-speech request, plain join or timing moved.
    for (const key of Object.keys(before).filter((one) => /^(audio|subtitles|youtube):/.test(one)))
      expect(on[key]).toBe(before[key]);
  });

  it("level the intro and outro beside the body", () => {
    const withEntries = plan({ ...narrated, loudness });
    const levels = withEntries.filter((one) => one.key.startsWith("level:"));
    const intro = withEntries.find((one) => one.key === "audio:intro");
    expect(levels.find((one) => one.key === "level:intro")?.dependsOn).toEqual(intro?.dependsOn);
    const body = withEntries.find((one) => one.key === "audio:body:concat");
    const level = levels.find((one) => one.key === "level:body");
    expect(level?.dependsOn).toEqual(body?.dependsOn);
    expect(level?.input.kind === "local" && level.input.operation).toBe("level-narration-v1");
    const video = withEntries.find((one) => one.key === "export:video");
    expect(video?.dependsOn).toContain("level:body");
  });

  it("master the video again for a new volume without joining again", () => {
    const on = fingerprints({ ...narrated, loudness });
    const louder = fingerprints({ ...narrated, loudness: { ...loudness, videoLufs: -12 } });
    expect(louder["export:video"]).not.toBe(on["export:video"]);
    expect(louder["level:body"]).toBe(on["level:body"]);
    // The audio files' target does not reach a video.
    const files = fingerprints({ ...narrated, loudness: { ...loudness, audioFilesLufs: -20 } });
    expect(files).toEqual(on);
  });

  it("master the audio-only export to the audio files' target", () => {
    const wav: RunConfig = { ...narrated, sources: { ...narrated.sources, video: "off" } };
    const off = fingerprints(wav);
    const on = fingerprints({ ...wav, loudness });
    expect(on["export:wav"]).not.toBe(off["export:wav"]);
    const quieter = fingerprints({ ...wav, loudness: { ...loudness, audioFilesLufs: -20 } });
    expect(quieter["export:wav"]).not.toBe(on["export:wav"]);
    expect(quieter["level:body"]).toBe(on["level:body"]);
  });

  it("level a multi-voice script's turns and master its audio files", () => {
    const script = "Alex: Welcome to the show.\n\nSam: Glad to be here.";
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
      turnGapSeconds: 0.35,
      nameTags: true,
      nativeDialogue: false,
      audioFiles: true,
    };
    const voiced: RunConfig = {
      ...narrated,
      intro: undefined,
      youtubeDescription: undefined,
      sources: { ...narrated.sources, video: "off" },
      provided: { article: script },
      voices,
    };
    const scripted = { ...content, articleMarkdown: script };
    const off = fingerprints(voiced, scripted);
    const recipes = plan({ ...voiced, loudness }, scripted);
    const on = Object.fromEntries(recipes.map((one) => [one.key, one.fingerprint]));
    const level = recipes.find((one) => one.key === "level:body");
    expect(level?.input.kind === "local" && (level.input.values as unknown[])[0]).toBe(
      "concat-turns-v1",
    );
    expect(level?.dependsOn.every((key) => key.startsWith("audio:body:turn:"))).toBe(true);
    const changed = Object.keys(off).filter((key) => on[key] !== off[key]);
    expect(changed.sort()).toEqual(["export:wav", "voices:files"]);
  });
});
