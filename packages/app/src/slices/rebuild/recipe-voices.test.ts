import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { RevisionContent } from "../revisions/model.js";
import type { Speaker, VoicesSettings } from "../voices/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";

const script = [
  "# Opening",
  "",
  "Alex: Welcome to the show.",
  "",
  "Sam: Glad to be here.",
  "",
  "# Tides",
  "",
  "Alex: Let's talk about tides.",
].join("\n");
const speaker = (id: string, name: string, voice: Speaker["voice"]): Speaker => ({
  id,
  name,
  role: "host",
  voice,
});
const plain = { provider: "voice", model: "tts", voice: "a" };
const voices: VoicesSettings = {
  format: "podcast",
  source: "script",
  speakers: [speaker("alex", "Alex", plain), speaker("sam", "Sam", { ...plain, voice: "s" })],
  turnGapSeconds: 0.35,
  nameTags: true,
  nativeDialogue: true,
  audioFiles: true,
};
const narrated: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate", video: "off" },
  provided: { article: script },
  subtitles: { mode: "files", language: "en", fontId: "default", fontSize: 48, position: "bottom" },
};
const voiced: RunConfig = { ...narrated, voices };
const scripted: RevisionContent = { ...content, articleMarkdown: script };

function plan(c: RunConfig, value: RevisionContent = scripted) {
  return buildRecipes({
    config: c,
    content: value,
    manifest: { outputs: [], pieces: [] },
    resolved: { articleMarkdown: value.articleMarkdown ?? null, researchNotes: null },
    catalogue,
  });
}
function fingerprints(c: RunConfig): Readonly<Record<string, string>> {
  return Object.fromEntries(plan(c).map((one) => [one.key, one.fingerprint]));
}

describe("multi-voice narration recipes", () => {
  it("speaks every turn in its speaker's voice and joins them with the turn gap", () => {
    const recipes = plan(voiced);
    const turns = recipes.filter((one) => one.key.startsWith("audio:body:turn:"));
    expect(
      turns.map((one) =>
        one.input.kind === "tts" ? [one.key, one.input.voice, one.input.text] : [one.key],
      ),
    ).toEqual([
      ["audio:body:turn:1:1", "a", "Welcome to the show."],
      ["audio:body:turn:2:1", "s", "Glad to be here."],
      ["audio:body:turn:3:1", "a", "Let's talk about tides."],
    ]);
    const concat = recipes.find((one) => one.key === "audio:body:concat");
    expect(concat?.input.kind === "local" && concat.input.operation).toBe("concat-turns-v1");
    expect(concat?.input.kind === "local" && (concat.input.values as unknown[])[1]).toEqual([
      [1, 0.35],
      [1, 0.35],
      [1, 0],
    ]);
    expect(concat?.dependsOn).toEqual(turns.map((one) => one.key));
  });

  it("redoes only the turns of the speaker whose voice changed", () => {
    const before = fingerprints(voiced);
    const after = fingerprints({
      ...voiced,
      voices: {
        ...voices,
        speakers: [
          voices.speakers[0] as Speaker,
          speaker("sam", "Sam", { ...plain, voice: "new" }),
        ],
      },
    });
    expect(after["audio:body:turn:1:1"]).toBe(before["audio:body:turn:1:1"]);
    expect(after["audio:body:turn:3:1"]).toBe(before["audio:body:turn:3:1"]);
    expect(after["audio:body:turn:2:1"]).not.toBe(before["audio:body:turn:2:1"]);
    expect(after["audio:body:concat"]).not.toBe(before["audio:body:concat"]);
  });

  it("re-joins without speaking again when only a pace or the gap changes", () => {
    const before = fingerprints(voiced);
    const after = fingerprints({
      ...voiced,
      voices: {
        ...voices,
        turnGapSeconds: 0.5,
        speakers: [
          { ...(voices.speakers[0] as Speaker), pace: 1.1 },
          voices.speakers[1] as Speaker,
        ],
      },
    });
    for (const key of ["audio:body:turn:1:1", "audio:body:turn:2:1", "audio:body:turn:3:1"])
      expect(after[key]).toBe(before[key]);
    expect(after["audio:body:concat"]).not.toBe(before["audio:body:concat"]);
  });

  it("sends consecutive turns of a native multi-speaker model as one request", () => {
    const eleven = { provider: "elevenlabs", model: "eleven_v3", voice: "x" };
    const recipes = plan({
      ...voiced,
      voices: {
        ...voices,
        speakers: [
          speaker("alex", "Alex", eleven),
          speaker("sam", "Sam", { ...eleven, voice: "y" }),
        ],
      },
    });
    const turns = recipes.filter((one) => one.key.startsWith("audio:body:turn:"));
    expect(turns.map((one) => one.key)).toEqual(["audio:body:turn:1:1"]);
    const input = turns[0]?.input;
    expect(input?.kind === "tts" && input.dialogue).toEqual([
      { speaker: "alex", turn: 1, voice: "x", text: "Welcome to the show." },
      { speaker: "sam", turn: 2, voice: "y", text: "Glad to be here." },
      { speaker: "alex", turn: 3, voice: "x", text: "Let's talk about tides." },
    ]);
  });

  it("refuses a script it cannot read, naming the line", () => {
    const recipes = plan(voiced, { ...scripted, articleMarkdown: "Alex: Hi.\n\nJordan: Hello." });
    const refused = recipes.find((one) => one.key === "audio:body:turn:1:1");
    expect(refused?.refusal).toMatch(/^The script can't be narrated: Line 3 of the script/);
  });

  it("makes the MP3 and M4B from the timing with the script's sections as chapters", () => {
    const files = plan(voiced).find((one) => one.key === "voices:files");
    expect(files?.input.kind === "local" && (files.input.values as unknown[])[2]).toEqual([
      ["Opening", 1],
      ["Tides", 3],
    ]);
    expect(files?.dependsOn).toContain("subtitles:timing");
  });

  it("adds the speaker panel's portraits to the caption file only when a speaker has one", () => {
    const values = (c: RunConfig) => {
      const files = plan(c).find((one) => one.key === "subtitles:files");
      return files?.input.kind === "local" ? (files.input.values as unknown[]) : [];
    };
    const speakerValues = (c: RunConfig) => values(c).at(-1) as unknown[];
    // Without a portrait the caption values are the ones every podcast had.
    expect(speakerValues(voiced)).toEqual([
      "voice-captions-v1",
      "podcast",
      true,
      [
        ["alex", "Alex"],
        ["sam", "Sam"],
      ],
      expect.anything(),
    ]);
    const portrait = "a".repeat(64);
    const pictured = (format: VoicesSettings["format"]): RunConfig => ({
      ...voiced,
      voices: {
        ...voices,
        format,
        speakers: [{ ...(voices.speakers[0] as Speaker), portrait }, voices.speakers[1] as Speaker],
      },
    });
    expect(speakerValues(pictured("podcast")).at(-1)).toEqual(["portraits", [portrait, null]]);
    // The voices themselves do not change, so no narration is redone for a picture.
    const before = fingerprints(voiced);
    const after = fingerprints(pictured("podcast"));
    for (const key of Object.keys(before).filter((one) => one.startsWith("audio:")))
      expect(after[key]).toBe(before[key]);
    expect(after["subtitles:files"]).not.toBe(before["subtitles:files"]);
    // An audiobook has no speaker panel, so a portrait changes nothing there.
    expect(fingerprints(pictured("audiobook"))).toEqual(
      fingerprints({ ...voiced, voices: { ...voices, format: "audiobook" } }),
    );
  });

  it("leaves a Narration-format run's recipes exactly as they were", () => {
    const without = plan(narrated);
    expect(plan({ ...narrated, voices: undefined })).toEqual(without);
    expect(without.some((one) => one.key.startsWith("audio:body:turn:"))).toBe(false);
    expect(without.some((one) => one.key === "voices:files")).toBe(false);
    // Voices set while narration is uploaded read as the Narration format.
    const provided = { ...narrated, sources: { ...narrated.sources, audio: "provide" as const } };
    expect(plan({ ...provided, voices })).toEqual(plan(provided));
  });
});
