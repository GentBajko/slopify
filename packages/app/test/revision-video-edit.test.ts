import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, expect, it, vi } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { outputPath } from "../src/slices/storage/layout.js";
import { legacyVideoEdit } from "../src/slices/video/edit-settings.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { composedFixture, current, save, start } from "./revision-rebuild.fake.js";

// The Video stage's edit settings over the real runner and the bundled ffmpeg: cuts that
// follow the narration's sentences, a crossfade, a vignette, chapter cards from the article's
// headings, and every other image animated by the image provider's image-to-video model, the
// first clip asked for being refused, so that image falls back to its still with a warning. No provider is
// called; the aligner, the narration and the image model are doubles.

// Twenty-four words, one a second: two chapters of a heading and two sentences each.
const article = [
  "## Early Days",
  "",
  "The river rose every spring. People built on the hills.",
  "",
  "## Later Years",
  "",
  "The dams came much later. Nobody moved again after that.",
].join("\n");
const narrationSeconds = 24;

vi.mock("../src/adapters/alignment/index.js", () => ({
  alignSubtitles: async (request: { readonly text: string }) =>
    request.text
      .split(/\s+/)
      .filter((word) => word !== "")
      .map((text, index) => ({ text, start: index, end: index + 0.9 })),
}));

const scratch = mkdtempSync(join(tmpdir(), "slopify-edit-fixtures-"));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);

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

function made(name: string, args: readonly string[]): Uint8Array {
  const path = join(scratch, name);
  execFileSync(ffmpeg, ["-v", "error", "-y", ...args, path]);
  return new Uint8Array(readFileSync(path));
}

it("cuts on sentences, crossfades, draws chapter cards and animates every other image", {
  timeout: 180_000,
}, async () => {
  const still = made("still.png", [
    "-f",
    "lavfi",
    "-i",
    "color=c=teal:s=480x270",
    "-frames:v",
    "1",
  ]);
  const clip = made("clip.mp4", [
    ...["-f", "lavfi", "-i", "testsrc2=s=480x270:r=30", "-t", "5", "-pix_fmt", "yuv420p"],
  ]);
  const images = fakeImage({
    bytes: still,
    video: clip,
    // The first clip is refused, which is final: that image stays a still.
    failAnimateOnAttempt: { 1: { kind: "refusal", message: "The model declined this image." } },
  });
  const h = await composedFixture({
    image: () => images,
    tts: () => fakeTts({ bytesFor: () => [narration()] }),
  });
  // The clip model sits in the image list under fal.ai, marked as video, priced per clip.
  const saved = h.deps.catalogue.read();
  h.setCatalogue({
    ...saved,
    // One narration request for the whole article, so the narration is the one WAV.
    tts: saved.tts.map((row) =>
      row.tts === undefined ? row : { ...row, tts: { ...row.tts, maxCharacters: 1000 } },
    ),
    image: [
      ...saved.image,
      {
        provider: "fal",
        id: "clip-model",
        name: "Clip model",
        enabled: true,
        deprecated: false,
        source: "https://example.test",
        keywords: ["video"],
        pricing: { perImage: 0.35 },
        image: { aspectRatios: ["16:9", "9:16"] },
      },
    ],
  });
  const base = current(h.deps, h.projectId);
  await save(h.deps, h.projectId, {
    config: {
      ...base.revision.config,
      sources: {
        ...base.revision.config.sources,
        audio: "generate",
        images: "generate",
        video: "generate",
      },
      audio: { provider: "openai-tts", model: "tts", voice: "first" },
      chunking: { mode: "whole" },
      provided: { article },
      edgeSilenceSeconds: 1,
      imageSeconds: 5,
      motionStyle: "still",
      videoEdit: {
        ...legacyVideoEdit,
        cuts: "narration",
        transition: "crossfade",
        transitionSeconds: 0.4,
        vignette: "subtle",
        chapterCards: true,
        animate: "every",
        animateEvery: 2,
        animateModel: "clip-model",
      },
    },
    content: {
      ...base.revision.content,
      articleMarkdown: article,
      imageOrder: ["one", "two", "three"],
      imageDefinitions: {
        one: { source: "generate", prompt: "One", assetId: null },
        two: { source: "generate", prompt: "Two", assetId: null },
        three: { source: "generate", prompt: "Three", assetId: null },
      },
    },
  });
  const keys = Object.keys(current(h.deps, h.projectId).revision.fingerprints);
  expect(keys).toEqual(
    expect.arrayContaining(["subtitles:timing", "animate:one", "animate:three", "export:video"]),
  );
  expect(keys).not.toContain("animate:two");

  await start(h.deps, h.projectId, keys);
  await h.runner.settled();
  const stage = h.deps.db
    .prepare("SELECT state,failure_reason FROM stages WHERE project_id=? AND kind='video'")
    .get(h.projectId);
  expect(stage).toEqual({ state: "done", failure_reason: null });
  // Two animations asked for, both with the still and five seconds; the first refused.
  expect(images.animated().map((one) => [one.model, one.seconds, one.aspect])).toEqual([
    ["clip-model", 5, "16:9"],
    ["clip-model", 5, "16:9"],
  ]);

  const view = current(h.deps, h.projectId);
  const ready = view.outputs.filter((row) => row.selected && row.state === "ready");
  const video = ready.find((row) => row.output.role === "video");
  // Whichever clip was asked for first was refused; the image says which.
  const warnings = video?.output.meta.warnings ?? [];
  expect(warnings).toEqual([
    expect.stringMatching(
      /^Image [13] is shown as a still: The model declined this image\. To try again, use Re-run section on Video\.$/,
    ),
  ]);
  const refused = warnings[0]?.startsWith("Image 1") === true ? 1 : 3;
  const kept = refused === 1 ? 3 : 1;
  const animated = ready.filter((row) => row.output.role === "animated_image");
  expect(animated.map((row) => [row.workKey, row.output.meta.index])).toEqual([
    [kept === 1 ? "animate:one" : "animate:three", kept],
  ]);

  // The video runs exactly as long as its sound: 1 + 24 + 1 s at 30 fps.
  const file = outputPath(h.deps.paths, h.projectId, video?.output.path ?? "");
  if (process.env.DUMP_EDIT === "1") {
    const { cpSync, writeFileSync } = await import("node:fs");
    const dir =
      "/tmp/claude-1000/-home-gent-code-slopify/ef323775-456d-417a-bdeb-afbec9e77b5a/scratchpad/e2e";
    const root = file.slice(0, file.indexOf("/p1/") + 4);
    cpSync(root, dir, { recursive: true });
    writeFileSync(`${dir}/where.txt`, root);
  }
  const decoded = spawnSync(
    ffmpeg,
    ["-hide_banner", "-i", file, "-map", "0:v", "-f", "null", "-"],
    {
      encoding: "utf8",
    },
  ).stderr;
  expect([...decoded.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]).toBe("780");

  const record = JSON.parse(
    readFileSync(
      outputPath(
        h.deps.paths,
        h.projectId,
        ready.find((row) => row.output.role === "render_params")?.output.path ?? "",
      ),
      "utf8",
    ),
  );
  const shots = record.editList.shots as readonly {
    readonly source: { readonly kind: string; readonly path: string };
    readonly frames: number;
    readonly transition?: { readonly kind: string; readonly frames: number };
  }[];
  // Every cut but one lands in a sentence pause: words run 1 + n seconds, so a pause is at
  // .95 past a whole second; the other is the chapter "Later Years" (word 11, at 12 s),
  // moved onto the pause before it.
  let at = 0;
  const cuts: number[] = [];
  for (const shot of shots.slice(0, -1)) {
    at += shot.frames;
    cuts.push(at / 30);
  }
  expect(cuts.every((cut) => Math.abs((cut % 1) - 0.95) < 0.04)).toBe(true);
  expect(shots.reduce((sum, shot) => sum + shot.frames, 0)).toBe(780);
  expect(shots.slice(1).every((shot) => shot.transition?.kind === "crossfade")).toBe(true);
  // Images take turns; the animated one comes as its clip, the refused one as its still.
  const kinds = shots.map((shot) => shot.source.kind).slice(0, 3);
  expect(kinds[kept - 1]).toBe("video");
  expect(kinds[refused - 1]).toBe("image");
  expect(kinds[1]).toBe("image");
  expect(record.editList.look).toEqual({
    vignette: "subtle",
    grain: "off",
    grade: "none",
    atmosphere: "none",
  });
  expect(record.editList.cards.map((card: { title: string }) => card.title)).toEqual([
    "Early Days",
    "Later Years",
  ]);
  expect(record.videoEdit.cuts).toBe("narration");
  expect(record.warnings).toHaveLength(1);
});
