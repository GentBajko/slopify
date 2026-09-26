import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
import { previewRebuild, startRebuild } from "../src/slices/rebuild/service.js";
import { outputPath } from "../src/slices/storage/layout.js";
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

// The first pick is answered twice: first with a clip too short to use, then with two good
// ones. A pick made again answers with `repick`. Each clip's prompts come back as many as its
// request asks for.
let repick: readonly ReturnType<typeof clip>[] | undefined;
function reply(request: LlmCompletion, attempt: number): readonly string[] {
  const system = request.messages[0]?.content ?? "";
  if (system.startsWith("You pick clips"))
    return [
      JSON.stringify(
        repick ??
          (request.messages.length > 2 ? [clip(5, 8), clip(1, 3)] : [clip(1, 3), clip(4, 4)]),
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

  // The selected short files, by work key, with the asset each one is.
  const files = (): Readonly<Record<string, string>> =>
    Object.fromEntries(
      current(h.deps, h.projectId)
        .outputs.filter(
          (row) =>
            row.selected &&
            (row.output.role === "short_video" || row.output.role === "short_image"),
        )
        .map((row) => [row.workKey, row.assetId]),
    );
  // Everything the review says to make, started and run to the end.
  const rebuild = async () => {
    const review = await previewRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: current(h.deps, h.projectId).revision.id,
      request: { kind: "allAffected" },
    });
    if (!review.ok) throw new Error(JSON.stringify(review));
    const result = await startRebuild(h.deps, {
      projectId: h.projectId,
      baseRevisionId: review.value.baseRevisionId,
      previewId: review.value.id,
      idempotencyKey: randomUUID(),
      acknowledgeUnknownCosts: true,
      confirmedProvidedWorkKeys: review.value.providedReuseRequired,
    });
    if (!result.ok) throw new Error(JSON.stringify(result));
    await h.runner.settled();
    expect(
      h.deps.db
        .prepare("SELECT state,failure_reason FROM stages WHERE project_id=? AND kind='video'")
        .get(h.projectId),
    ).toEqual({ state: "done", failure_reason: null });
    return review.value;
  };
  const edit = () => {
    const now = current(h.deps, h.projectId).revision;
    return { config: now.config, content: now.content };
  };

  // Make short 2 again: new image prompts, images and render for it alone, priced with its
  // images before its prompts are written.
  const made = files();
  // A save that changes nothing carries every unfolded step over as it is.
  await save(h.deps, h.projectId, edit());
  await save(h.deps, h.projectId, { ...edit(), regenerate: ["shorts:2"] });
  const remade = await rebuild();
  expect(remade.work.filter((row) => row.disposition !== "reuse").map((row) => row.key)).toEqual([
    "shorts:2:prompts",
  ]);
  expect(
    remade.costs.rows.filter((row) => row.stage === "shorts:2:prompts").map((row) => row.detail),
  ).toEqual(expect.arrayContaining([expect.stringContaining("3 vertical images for this short")]));
  expect(model.calls()).toBe(5);
  expect(images.calls()).toBe(8);
  const again = files();
  for (const key of ["shorts:1:render", "shorts:1:image:1", "shorts:1:image:2"])
    expect(again[key]).toBe(made[key]);
  for (const key of ["shorts:2:render", "shorts:2:image:1", "shorts:2:image:3"])
    expect(again[key]).not.toBe(made[key]);

  // Pick different moments: sentences 1-3 come back and keep short 1's work; sentences 4-7
  // are new, so only they are written, drawn and rendered.
  repick = [clip(4, 7), clip(1, 3)];
  await save(h.deps, h.projectId, { ...edit(), regenerate: ["shorts:pick"] });
  await rebuild();
  // 20 s of sentences 4-7: two images.
  expect(model.calls()).toBe(7);
  expect(images.calls()).toBe(10);
  const moved = files();
  for (const key of ["shorts:1:render", "shorts:1:image:1", "shorts:1:image:2"])
    expect(moved[key]).toBe(made[key]);
  expect(moved["shorts:2:render"]).not.toBe(again["shorts:2:render"]);
  const videos = current(h.deps, h.projectId)
    .outputs.filter((row) => row.selected && row.output.role === "short_video")
    .map((row) => [row.output.meta.short, row.output.meta.sentences]);
  expect(videos.toSorted()).toEqual([
    [1, [1, 3]],
    [2, [4, 7]],
  ]);

  // Fewer shorts: the one left is sentences 1-3 again, and short 2's files leave the
  // project's selection with the pick that dropped them.
  repick = [clip(1, 3)];
  const fewer = edit();
  await save(h.deps, h.projectId, {
    ...fewer,
    config: {
      ...fewer.config,
      shorts: { enabled: true, count: 1, minSeconds: 15, maxSeconds: 25 },
    },
  });
  await rebuild();
  expect(model.calls()).toBe(8);
  expect(images.calls()).toBe(10);
  expect(Object.keys(files()).sort()).toEqual([
    "shorts:1:image:1",
    "shorts:1:image:2",
    "shorts:1:render",
  ]);
  expect(files()["shorts:1:render"]).toBe(made["shorts:1:render"]);
  expect(
    h.deps.db
      .prepare("SELECT count(*) AS n FROM outputs WHERE project_id=? AND role='short_video'")
      .get(h.projectId),
  ).toEqual({ n: 1 });
});
