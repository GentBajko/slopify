import { expect, it } from "vitest";
import { layout } from "../../kernel/paths.js";
import type { RunConfig } from "../admission/model.js";
import type { RevisionOutputView, RevisionView } from "../revisions/model.js";
import type { Output } from "../storage/model.js";
import { type BodyWordTimings, bodyWordTimings } from "./narration-words.js";
import { config, emptyView } from "./recipe-fixture.js";

const paths = layout("/data");
const narrated: RunConfig = { ...config, sources: { ...config.sources, audio: "generate" } };

function part(role: Output["role"], durationMs: number | null): RevisionOutputView {
  return {
    recordId: `ro-${role}`,
    publicationId: null,
    selected: true,
    available: true,
    slot: role,
    workKey: `audio:${role}`,
    assetId: `a-${role}`,
    fingerprint: "f",
    state: "ready",
    output: {
      id: `o-${role}`,
      projectId: "p1",
      stageKind: "audio",
      role,
      path: `audio/${role}.mp3`,
      originalFilename: null,
      bytes: 3,
      durationMs,
      meta: {},
      createdAt: "2026-09-10T00:00:00.000Z",
    },
  };
}

function view(runConfig: RunConfig, outputs: readonly RevisionOutputView[]): RevisionView {
  return { ...emptyView(runConfig), outputs };
}

function harness(measured: Readonly<Record<string, number>> = {}) {
  const asked: string[] = [];
  return {
    asked,
    deps: {
      paths,
      measure: async (path: string) => {
        asked.push(path);
        const ms = Object.entries(measured).find(([name]) => path.endsWith(name))?.[1];
        if (ms === undefined) throw new Error(`ffmpeg could not read ${path}`);
        return ms;
      },
    },
  };
}

const words = (
  list: readonly { text: string; start: number; end: number }[],
  omissions: readonly { start: number; text: string }[] = [],
) => JSON.stringify({ key: "k", words: list, omissions });

const read = (timing: BodyWordTimings) =>
  JSON.parse(timing.ok ? timing.value : "null") as {
    words: { text: string; start: number; end: number }[];
    omissions: { start: number; text: string }[];
  } | null;

it("moves the body's words back by the edge, intro and gap, and leaves out the intro's and outro's", async () => {
  const h = harness();
  const spoken: RunConfig = {
    ...narrated,
    intro: { name: "Intro", mode: "llm" },
    outro: { name: "Outro", mode: "llm" },
    edgeSilenceSeconds: 1,
    silenceGapSeconds: 0.5,
  };
  // Edge 1 s, intro 2 s, gap 0.5 s: the body runs from 3.5 s to 6.5 s, then a gap and the outro.
  const timing = await bodyWordTimings(
    h.deps,
    view(spoken, [part("audio_intro", 2000), part("audio_body", 3000), part("audio_outro", 1000)]),
    words(
      [
        { text: "Welcome", start: 1.2, end: 1.8 },
        { text: "Hello", start: 3.6, end: 4 },
        { text: "harbor", start: 6.2, end: 6.6 },
        { text: "Goodbye", start: 7.1, end: 7.6 },
      ],
      [
        { start: 1.5, text: "uh" },
        { start: 5, text: "um" },
        { start: 7.2, text: "er" },
      ],
    ),
  );
  const body = read(timing);
  expect(body?.words.map((word) => word.text)).toEqual(["Hello", "harbor"]);
  expect(body?.words[0]?.start).toBeCloseTo(0.1);
  // The last word is clipped at the body's end.
  expect(body?.words[1]?.end).toBeCloseTo(3);
  expect(body?.omissions).toEqual([{ start: 1.5, text: "um" }]);
});

// An uploaded narration has no length recorded: it is measured, as the export measures it.
it("measures a provided narration whose length was never recorded", async () => {
  const h = harness({ "audio_body.mp3": 4000 });
  const provided: RunConfig = { ...config, sources: { ...config.sources, audio: "provide" } };
  const timing = await bodyWordTimings(
    h.deps,
    view(provided, [part("audio_body", null)]),
    words([
      { text: "Hello", start: 0.2, end: 0.6 },
      { text: "end", start: 3.8, end: 4.2 },
    ]),
  );
  expect(h.asked).toEqual([`${paths.projects}/p1/audio/audio_body.mp3`]);
  expect(read(timing)?.words).toEqual([
    { text: "Hello", start: 0.2, end: 0.6 },
    { text: "end", start: 3.8, end: 4 },
  ]);
});

it("refuses, saying why, when the timing can't be read or the narration can't be timed", async () => {
  const unreadable = harness();
  expect(
    await bodyWordTimings(unreadable.deps, view(narrated, [part("audio_body", 3000)]), "{not json"),
  ).toEqual({ ok: false, reason: expect.stringContaining("JSON") });
  const unmeasured = harness();
  expect(
    await bodyWordTimings(
      unmeasured.deps,
      view(narrated, [part("audio_body", null)]),
      words([{ text: "Hello", start: 0.2, end: 0.6 }]),
    ),
  ).toEqual({ ok: false, reason: expect.stringContaining("ffmpeg could not read") });
  const missing = harness();
  expect(await bodyWordTimings(missing.deps, view(narrated, []), words([]))).toEqual({
    ok: false,
    reason: expect.stringContaining("narration audio isn't finished"),
  });
});

// The words were timed with the intro and outro the settings speak: without one of them the
// body's place on that clock is unknown.
it("refuses when an intro or outro the settings speak has no finished audio", async () => {
  const spoken: RunConfig = {
    ...narrated,
    intro: { name: "Intro", mode: "llm" },
    outro: { name: "Outro", mode: "llm" },
  };
  const timing = words([{ text: "Hello", start: 2.2, end: 2.6 }]);
  const noIntro = await bodyWordTimings(
    harness().deps,
    view(spoken, [part("audio_body", 3000), part("audio_outro", 1000)]),
    timing,
  );
  expect(noIntro).toEqual({ ok: false, reason: expect.stringContaining("intro") });
  const noOutro = await bodyWordTimings(
    harness().deps,
    view(spoken, [part("audio_intro", 2000), part("audio_body", 3000)]),
    timing,
  );
  expect(noOutro).toEqual({ ok: false, reason: expect.stringContaining("outro") });
});
