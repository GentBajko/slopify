import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import { config } from "../rebuild/recipe-fixture.js";
import { outputPath } from "../storage/layout.js";
import { defaultVoicesSettings } from "../voices/model.js";
import { cueSpeaker } from "../voices/timing.js";
import type { ManualCue, RevisionEdit, RevisionView } from "./model.js";
import { withCueSpeakers } from "./mutation-cues.js";
import { revisionContentSchema } from "./schema.js";

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const words = [
  { text: "Welcome", start: 0.5, end: 1, speaker: "alex" },
  { text: "back.", start: 1, end: 1.6, speaker: "alex" },
  { text: "Thanks", start: 2, end: 2.5, speaker: "sam" },
  { text: "Alex.", start: 2.5, end: 3, speaker: "sam" },
];
const podcast: RunConfig = {
  ...config,
  sources: { ...config.sources, audio: "generate" },
  voices: defaultVoicesSettings("podcast"),
};

// A saved revision whose captions were edited once, with its word timing on disk.
function base(cues: readonly ManualCue[], timing = true) {
  const dataDir = mkdtempSync(join(tmpdir(), "slopify-cue-speakers-"));
  dirs.push(dataDir);
  const paths = layout(dataDir);
  const file = outputPath(paths, "p1", "assets/subtitles.json");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify({ key: "k", words, omissions: [] }));
  const view = {
    articleMarkdown: null,
    current: true,
    pieces: [],
    revision: {
      id: "r1",
      projectId: "p1",
      config: podcast,
      content: { subtitleCues: { audioFingerprint: "f", cues } },
    },
    outputs: timing
      ? [
          {
            workKey: "subtitles:timing",
            selected: true,
            available: true,
            state: "ready",
            output: { role: "subtitle_words", path: "assets/subtitles.json" },
          },
        ]
      : [],
  } as unknown as RevisionView;
  const edit = (next: readonly ManualCue[], over: Partial<RunConfig> = {}): RevisionEdit =>
    ({
      config: { ...podcast, ...over },
      content: { subtitleCues: { audioFingerprint: "f", cues: next } },
    }) as unknown as RevisionEdit;
  return { deps: { paths }, view, edit };
}

describe("speakers of edited captions", () => {
  it("finds the speaker whose words fill a cue, or the nearest one in a pause", () => {
    expect(cueSpeaker({ start: 0.4, end: 1.7 }, words)).toBe("alex");
    // Mostly Sam's words, a little of Alex's.
    expect(cueSpeaker({ start: 1.4, end: 3 }, words)).toBe("sam");
    // In the pause between them, nearer Sam.
    expect(cueSpeaker({ start: 1.85, end: 1.95 }, words)).toBe("sam");
    expect(cueSpeaker({ start: 0, end: 1 }, [{ start: 0, end: 1 }])).toBeUndefined();
  });

  it("keeps each cue's speaker through edits of its text and timing", () => {
    const saved: ManualCue[] = [
      { id: "a", text: "Welcome back.", start: 0.5, end: 1.6, speaker: "alex" },
      { id: "b", text: "Thanks Alex.", start: 2, end: 3, speaker: "sam" },
    ];
    const { deps, view, edit } = base(saved);
    // The caption editor sends text and times only. Sam's cue is moved well into Alex's words:
    // it is still Sam's, by its id.
    const edited = withCueSpeakers(
      deps,
      view,
      edit([
        { id: "a", text: "Welcome back, everyone.", start: 0.5, end: 1.2 },
        { id: "b", text: "Thanks, Alex!", start: 1.3, end: 3 },
        // A cue the user added over Sam's words.
        { id: "c", text: "Alex.", start: 2.5, end: 3.2 },
      ]),
    );
    expect(edited.content.subtitleCues?.cues.map((cue) => [cue.id, cue.speaker])).toEqual([
      ["a", "alex"],
      ["b", "sam"],
      ["c", "sam"],
    ]);
    // A speaker the client sends is kept as sent.
    const sent = withCueSpeakers(
      deps,
      view,
      edit([{ id: "a", text: "Hi.", start: 0.5, end: 1, speaker: "sam" }]),
    );
    expect(sent.content.subtitleCues?.cues[0]?.speaker).toBe("sam");
  });

  it("accepts a speaker id on a saved cue and refuses anything else there", () => {
    const cues = revisionContentSchema.shape.subtitleCues;
    const cue = { id: "a", text: "Hi.", start: 0, end: 1 };
    expect(cues.parse({ audioFingerprint: "f", cues: [{ ...cue, speaker: "cast-ada" }] })).toEqual({
      audioFingerprint: "f",
      cues: [{ ...cue, speaker: "cast-ada" }],
    });
    expect(
      cues.safeParse({ audioFingerprint: "f", cues: [{ ...cue, speaker: "Ada {bold}" }] }).success,
    ).toBe(false);
  });

  it("gives cues edited for the first time their speaker from the word timing", () => {
    const { deps, view, edit } = base([]);
    const edited = withCueSpeakers(
      deps,
      view,
      edit([
        { id: "a", text: "Welcome back.", start: 0.5, end: 1.6 },
        { id: "b", text: "Thanks Alex.", start: 2, end: 3 },
      ]),
    );
    expect(edited.content.subtitleCues?.cues.map((cue) => cue.speaker)).toEqual(["alex", "sam"]);
  });

  it("leaves one-voice captions, and captions without timing, as they were sent", () => {
    const cues: ManualCue[] = [{ id: "a", text: "Welcome back.", start: 0.5, end: 1.6 }];
    const { deps, view, edit } = base([]);
    const narration = edit(cues, { voices: undefined });
    expect(withCueSpeakers(deps, view, narration)).toBe(narration);
    const untimed = base([], false);
    expect(
      withCueSpeakers(untimed.deps, untimed.view, untimed.edit(cues)).content.subtitleCues?.cues,
    ).toEqual(cues);
  });
});
