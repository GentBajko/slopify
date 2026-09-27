import { describe, expect, it } from "vitest";
import type { RunConfig } from "../admission/model.js";
import type { ManifestPiece, RevisionContent } from "../revisions/model.js";
import type { Speaker, VoicesSettings } from "../voices/model.js";
import { buildRecipes } from "./recipe-build.js";
import { catalogue, config, content } from "./recipe-fixture.js";
import type { ResolvedWorkRecipe } from "./recipe-model.js";

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

  it("keeps an edited caption's speaker in the manual cues, and nothing extra without one", () => {
    const cue = { id: "one", text: "Welcome.", start: 0, end: 1 };
    const values = (cues: RevisionContent["subtitleCues"]) => {
      const recipe = plan(voiced, { ...scripted, subtitleCues: cues }).find(
        (one) => one.key === "subtitles:cues",
      );
      return recipe?.input.kind === "local" ? (recipe.input.values as unknown[])[1] : undefined;
    };
    expect(values({ audioFingerprint: "f", cues: [cue] })).toEqual([cue]);
    expect(values({ audioFingerprint: "f", cues: [{ ...cue, speaker: "alex" }] })).toEqual([
      { ...cue, speaker: "alex" },
    ]);
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

describe("delivery cues for speakers", () => {
  const inworld = { provider: "inworld", model: "inworld-tts-2", voice: "Ashley" };
  const prepared: RunConfig = {
    ...voiced,
    narrationPrompt: "Lively",
    rendered: { ...voiced.rendered, narration: "A lively two-host show." },
    audio: { ...inworld },
    voices: {
      ...voices,
      speakers: [speaker("alex", "Alex", inworld), speaker("sam", "Sam", { ...plain, voice: "s" })],
    },
  };
  const inworldCatalogue = {
    ...catalogue,
    tts: [
      ...catalogue.tts,
      ...catalogue.tts.map((row) => ({ ...row, provider: "inworld", id: "inworld-tts-2" })),
    ],
  };
  const build = (pieces: readonly ManifestPiece[] = []) =>
    buildRecipes({
      config: prepared,
      content: scripted,
      manifest: { outputs: [], pieces },
      resolved: { articleMarkdown: script, researchNotes: null },
      catalogue: inworldCatalogue,
    });
  const answered = (recipes: readonly ResolvedWorkRecipe[], cues: unknown[]): ManifestPiece[] =>
    recipes
      .filter((one) => one.key.startsWith("narration:prepare:body:"))
      .map((one, index) => ({
        key: one.key,
        stageKind: "audio",
        assetId: null,
        fingerprint: one.fingerprint,
        piece: {
          id: `p${String(index)}`,
          stageId: "s",
          kind: "prompt_written",
          idx: index + 1,
          state: "done",
          payload: JSON.stringify({ text: JSON.stringify({ cues }) }),
        } as ManifestPiece["piece"],
      }));

  it("prepares only the Inworld TTS-2 speaker's turns, naming who says them", () => {
    const recipes = build();
    const preparations = recipes.filter((one) => one.key.startsWith("narration:prepare:body:"));
    expect(preparations.map((one) => one.key)).toEqual([
      "narration:prepare:body:audio:body:turn:1",
      "narration:prepare:body:audio:body:turn:3",
    ]);
    const first = preparations[0];
    if (first?.input.kind !== "llm") throw new Error("Missing preparation");
    expect(JSON.stringify(first.input.messages)).toContain("Alex (host)");
    expect(first.input.preparation?.source).toBe("Welcome to the show.");
    // Nothing is spoken until every turn's cues are in: the turns wait as one future.
    expect(recipes.some((one) => one.input.kind === "tts")).toBe(false);
    const future = recipes.find((one) => one.key === "audio:body:future");
    expect(future?.dependsOn).toEqual(expect.arrayContaining(preparations.map((one) => one.key)));
    expect(recipes.find((one) => one.key === "audio:body:concat")?.dependsOn).toEqual([
      "audio:body:future",
    ]);
  });

  it("speaks the tags, but keeps each turn's clean words as its transcript", () => {
    const cues = [{ sentence: 1, kind: "instruction", text: "say warmly" }];
    const recipes = build(answered(build(), cues));
    const turns = recipes.flatMap((one) =>
      one.input.kind === "tts"
        ? [[one.key, one.input.text, one.input.spokenText ?? null, one.dependsOn]]
        : [],
    );
    expect(turns).toEqual([
      [
        "audio:body:turn:1:1",
        "[say warmly] Welcome to the show.",
        "Welcome to the show.",
        ["narration:prepare:body:audio:body:turn:1"],
      ],
      ["audio:body:turn:2:1", "Glad to be here.", null, ["article:body"]],
      [
        "audio:body:turn:3:1",
        "[say warmly] Let's talk about tides.",
        "Let's talk about tides.",
        ["narration:prepare:body:audio:body:turn:3"],
      ],
    ]);
  });

  it("waits for the script, then prepares, while an audiobook's text is split", () => {
    const recipes = buildRecipes({
      config: {
        ...prepared,
        voices: { ...(prepared.voices as VoicesSettings), source: "attribute" },
      },
      content: scripted,
      manifest: { outputs: [], pieces: [] },
      resolved: { articleMarkdown: script, researchNotes: null },
      catalogue: inworldCatalogue,
    });
    expect(recipes.map((one) => one.key)).toEqual(
      expect.arrayContaining([
        "script:attribute",
        "narration:prepare:body:future",
        "audio:body:future",
      ]),
    );
    expect(recipes.find((one) => one.key === "audio:body:future")?.dependsOn).toContain(
      "narration:prepare:body:future",
    );
  });

  it("changes nothing for a run without a Narration Preparation prompt", () => {
    const without = { ...prepared, narrationPrompt: undefined };
    expect(
      buildRecipes({
        config: without,
        content: scripted,
        manifest: { outputs: [], pieces: [] },
        resolved: { articleMarkdown: script, researchNotes: null },
        catalogue: inworldCatalogue,
      }).some((one) => one.key.startsWith("narration:prepare:")),
    ).toBe(false);
  });
});
