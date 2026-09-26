import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import { previewRebuild } from "../src/slices/rebuild/service.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { allTelemetryEvents, insertMachine } from "../src/slices/telemetry/repo.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// The whole Shorts step over the real runner, the real deferral and the bundled ffmpeg: the
// pick, one retry after a clip that broke the rules, each clip's image prompts, the vertical
// images and the renders. No provider is called; the aligner, the text model, the narration
// and the image model are doubles.

// Forty words at one a second: sentence n is words 5(n-1)..5n-1, so it runs 5 s from
// 2 + 5(n-1) once the 2 s of silence at the start is counted.
const article = Array.from(
  { length: 8 },
  (_value, at) => `Sentence ${String(at + 1)} has five words.`,
).join(" ");
const narrationSeconds = 40;

vi.mock("../src/adapters/alignment/index.js", () => ({
  alignSubtitles: async (request: { readonly text: string }) =>
    request.text
      .split(/\s+/)
      .filter((word) => word !== "")
      .map((text, index) => ({ text, start: index, end: index + 0.9 })),
}));

const scratch = mkdtempSync(join(tmpdir(), "slopify-shorts-fixtures-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);

// A quiet WAV exactly as long as the aligner says the narration is.
function narration(): Uint8Array {
  const data = narrationSeconds * 8000 * 2;
  const bytes = Buffer.alloc(44 + data);
  bytes.write("RIFF");
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(data, 40);
  return bytes;
}

function still(): Uint8Array {
  const path = join(scratch, "still.png");
  execFileSync(ffmpeg, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=teal:s=270x480",
    "-frames:v",
    "1",
    path,
  ]);
  return new Uint8Array(readFileSync(path));
}

const clip = (first: number, last: number) => ({
  first,
  last,
  title: `Sentences ${String(first)} to ${String(last)}`,
  description: "A clip that stands alone.",
  hashtags: ["#Sentences", "#Words", "#Test"],
  why: "It has a hook.",
});

// The pick is answered twice: first with a clip too short to use, then with two good ones.
// Each clip's prompts come back as many as its request asks for.
function reply(request: LlmCompletion, attempt: number): readonly string[] {
  const system = request.messages[0]?.content ?? "";
  if (system.startsWith("You pick clips"))
    return [
      JSON.stringify(
        request.messages.length > 2 ? [clip(5, 8), clip(1, 3)] : [clip(1, 3), clip(4, 4)],
      ),
    ];
  const count = Number(/Exactly (\d+) prompt/.exec(system)?.[1] ?? "0");
  return [
    JSON.stringify(
      Array.from(
        { length: count },
        (_value, at) => `Image ${String(at + 1)}, try ${String(attempt)}`,
      ),
    ),
  ];
}

it("picks the clips, writes their prompts, makes vertical images and renders every short", {
  timeout: 120_000,
}, async () => {
  const model = fakeLlm({ reply });
  const images = fakeImage({ bytes: still() });
  const h = await composedFixture({
    llm: () => model,
    image: () => images,
    tts: () => fakeTts({ bytesFor: () => [narration()] }),
  });
  const saved = h.deps.catalogue.read();
  h.setCatalogue({
    ...saved,
    tts: saved.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters: 1000 } },
    ),
    providers: { ...saved.providers, openrouter: { maxConcurrent: 1 } },
    llm: [
      {
        provider: "openrouter",
        id: "text",
        name: "Text",
        enabled: true,
        deprecated: false,
        source: "https://example.test",
        keywords: [],
        pricing: {},
        llm: { webSearch: false },
      },
    ],
  });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      title: "Sentences",
      sources: { ...base.revision.config.sources, audio: "generate", images: "off", video: "off" },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      llm: { provider: "openrouter", model: "text" },
      chunking: { mode: "whole" },
      provided: { article },
      edgeSilenceSeconds: 2,
      imageSeconds: 10,
      motionStyle: "still",
      shorts: { enabled: true, count: 2, minSeconds: 15, maxSeconds: 25 },
    },
    content: { ...base.revision.content, imageOrder: [], imageDefinitions: {} },
  });
  const keys = Object.keys(current(h.deps, h.projectId).revision.fingerprints);
  expect(keys).toEqual(
    expect.arrayContaining(["subtitles:timing", "shorts:pick", "shorts:future"]),
  );

  // A dismissed notice, so the run's usage counts are written.
  insertMachine(h.deps.db, {
    machineId: "5b0c1f9e-0d4e-4d7a-9a55-3b1f2f1e7c11",
    noticeSeenAt: new Date().toISOString(),
    appVersion: "test",
  });
  const started = await start(h.deps, h.projectId, ["export:wav", "shorts:pick", "shorts:future"]);
  // The change list names the switch and the settings in words.
  expect(started.preview.review?.inputChanges).toEqual(
    expect.arrayContaining([
      { label: "Shorts", before: "Off", after: "On" },
      { label: "Number of shorts", before: null, after: "2" },
      { label: "Short length (seconds)", before: null, after: "15-25" },
    ]),
  );
  await h.runner.settled();

  const stage = h.deps.db
    .prepare("SELECT state,failure_reason FROM stages WHERE project_id=? AND kind='video'")
    .get(h.projectId);
  expect(stage).toEqual({ state: "done", failure_reason: null });
  // One short counted per render, with no stage: a short is not a finished video.
  const counted = allTelemetryEvents(h.deps.db)
    .map((event) => event.payload)
    .filter((payload) => payload.shorts !== undefined);
  expect(counted).toEqual([
    { appVersion: "test", shorts: 1 },
    { appVersion: "test", shorts: 1 },
  ]);
  // The pick twice (the second with what was wrong), then one prompt call per clip.
  expect(model.calls()).toBe(4);
  const retry = model.seen()[1] ?? [];
  expect(retry.at(-1)?.content).toContain(
    "Clip 2 (sentences 4-4) lasts 5 seconds, and each clip must last 15-25 seconds.",
  );
  const picked = model.seen()[0]?.at(-1)?.content ?? "";
  expect(picked).toContain("[1] (0:02-0:06) Sentence 1 has five words.");
  // 15.2 s and 20.35 s at 10 s per image: two vertical images, then three.
  expect(images.calls()).toBe(5);
  expect(images.seen().every((request) => request.aspect === "9:16")).toBe(true);

  const view = current(h.deps, h.projectId);
  const selected = view.outputs.filter((row) => row.selected && row.state === "ready");
  const shorts = selected
    .filter((row) => row.output.role === "short_video")
    .toSorted((a, b) => (a.output.meta.short ?? 0) - (b.output.meta.short ?? 0));
  expect(shorts.map((row) => [row.workKey, row.output.stageKind, row.output.meta.short])).toEqual([
    ["shorts:1:render", "video", 1],
    ["shorts:2:render", "video", 2],
  ]);
  // Measured off the rendered files: sentences 1-3 with a quarter second before, and
  // sentences 5-8 with 0.4 s after.
  expect(shorts[0]?.output.durationMs).toBeGreaterThan(15_100);
  expect(shorts[0]?.output.durationMs).toBeLessThan(15_400);
  expect(shorts[1]?.output.durationMs).toBeGreaterThan(20_200);
  expect(shorts[1]?.output.durationMs).toBeLessThan(20_500);
  expect(
    selected
      .filter((row) => row.output.role === "short_image")
      .map((row) => row.workKey)
      .sort(),
  ).toEqual([
    "shorts:1:image:1",
    "shorts:1:image:2",
    "shorts:2:image:1",
    "shorts:2:image:2",
    "shorts:2:image:3",
  ]);
  const list = selected.find((row) => row.output.role === "shorts");
  const json = JSON.parse(
    readFileSync(outputPath(h.deps.paths, h.projectId, list?.output.path ?? ""), "utf8"),
  );
  expect(json.shorts).toEqual([
    expect.objectContaining({
      number: 1,
      first: 1,
      last: 3,
      start: 1.75,
      title: "Sentences 1 to 3",
      description: "A clip that stands alone.",
      hashtags: ["#Sentences", "#Words", "#Test"],
    }),
    expect.objectContaining({ number: 2, first: 5, last: 8 }),
  ]);

  // Nothing is left to rebuild: every short is the current one.
  const preview = await previewRebuild(h.deps, {
    projectId: h.projectId,
    baseRevisionId: view.revision.id,
    request: { kind: "allAffected" },
  });
  if (!preview.ok) throw new Error(JSON.stringify(preview));
  expect(preview.value.work.filter((row) => row.disposition !== "reuse")).toEqual([]);
});
