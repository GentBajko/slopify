import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { saveRevision } from "../revisions/mutations.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { insertStagedFile } from "../storage/repo.js";
import { binary, inspectMedia } from "../video/export.fake.js";
import { probeDurationMs } from "../video/ffmpeg.js";
import { exportFixture } from "./runtime-export.fake.js";
import { executeExportRecipe } from "./runtime-export.js";
import { executeSubtitleRecipe } from "./runtime-subtitles.js";

// A narrated video through the real bundled ffmpeg: four seconds of provided narration over one
// uploaded still, with the captions burned in or left as files.

function pcm(seconds: number): Buffer {
  const rate = 8000;
  const bytes = Buffer.alloc(44 + rate * 2 * seconds);
  bytes.write("RIFF", 0);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write("data", 36);
  bytes.writeUInt32LE(bytes.length - 44, 40);
  return bytes;
}

async function narratedVideo(mode: "files" | "burn-in") {
  const h = await exportFixture(true, pcm(4));
  const deps = { ...h.deps, ffmpeg: binary };
  const still = join(h.deps.paths.staging, "image");
  execFileSync(binary, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=320x180",
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-c:v",
    "png",
    still,
  ]);
  insertStagedFile(h.deps.db, {
    id: "image",
    stageKind: "images",
    path: "image",
    originalFilename: "image.png",
    bytes: statSync(still).size,
    state: "staged",
    createdAt: h.deps.clock.now().toISOString(),
  });
  const old = h.view();
  const saved = await saveRevision(h.deps, {
    projectId: h.projectId,
    baseRevisionId: old.revision.id,
    idempotencyKey: `video-${mode}`,
    edit: {
      config: {
        ...old.revision.config,
        sources: { ...old.revision.config.sources, images: "provide", video: "generate" },
        imageSeconds: 4,
        subtitles: {
          mode,
          language: "en",
          fontId: "default",
          fontSize: 48,
          position: "bottom",
        },
      },
      content: {
        ...old.revision.content,
        imageOrder: ["one"],
        imageDefinitions: { one: { source: "provide", assetId: null, prompt: null } },
        subtitleCues: {
          audioFingerprint: "pending",
          cues: [{ id: "one", text: "Late caption", start: 2, end: 4 }],
        },
      },
      uploads: [{ stagedFileId: "image", destination: { kind: "image", imageKey: "one" } }],
    },
  });
  if (!saved.ok) throw new Error(JSON.stringify(saved));
  const revisionId = saved.view.revision.id;
  for (const key of ["subtitles:cues", "subtitles:files"]) {
    const part = h.grant(key, revisionId);
    expect(await executeSubtitleRecipe(deps, part.context, part.piece)).toBe("done");
  }
  const count = vi.fn();
  const part = h.grant("export:video", revisionId);
  expect(await executeExportRecipe({ ...deps, count }, part.context, part.piece)).toBe("done");
  const outputs = h.view(revisionId).outputs.filter((row) => row.selected);
  const video = outputs.find((row) => row.output.role === "video");
  const record = outputs.find(
    (row) => row.output.role === "render_params" && row.workKey === "export:video",
  );
  if (video === undefined || record === undefined) throw new Error("Incomplete video bundle");
  return {
    h,
    count,
    video,
    path: outputPath(h.deps.paths, h.projectId, video.output.path),
    record: readFileSync(outputPath(h.deps.paths, h.projectId, record.output.path), "utf8"),
  };
}

// The brightest luma in the bottom strip of the frame at `seconds`.
function captionStripPeak(path: string, seconds: number): number {
  const frame = execFileSync(
    binary,
    [
      "-v",
      "error",
      "-ss",
      String(seconds),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      "crop=iw:ih/4:0:ih*3/4,format=gray",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return frame.reduce((peak, value) => Math.max(peak, value), 0);
}

it("renders the narration over the still to the length it planned, and keeps no working files", async () => {
  const { h, count, video, path, record } = await narratedVideo("files");
  try {
    const measured = await probeDurationMs(binary, path, new AbortController().signal, h.deps.log);
    const plan = JSON.parse(record);
    expect(Math.abs(measured - plan.totalSeconds * 1000)).toBeLessThanOrEqual(120);
    expect(video.output.durationMs).toBeCloseTo(4000, -2);
    const media = inspectMedia(path);
    expect(media).toMatch(/Video: h264/);
    expect(media).toMatch(/Audio: aac/);
    // The edit list is recorded relative to the project, never with this machine's paths.
    expect(record).not.toContain(h.deps.paths.dataDir);
    expect(plan.editList.shots.length).toBeGreaterThan(0);
    expect(
      readdirSync(projectDir(h.deps.paths, h.projectId)).filter(
        (name) => name.startsWith("render-") || name.startsWith("lines-"),
      ),
    ).toEqual([]);
    expect(count).toHaveBeenCalledExactlyOnceWith("stage.completed", { stage: "video" });
    expect(video.output.meta.subtitlesMode).toBe("files");
    // Captions left as files are not drawn on the picture.
    expect(captionStripPeak(path, 3)).toBeLessThan(40);
  } finally {
    h.close();
  }
}, 60_000);

it("burns the captions in, drawn only from the moment they start", async () => {
  const { h, video, path } = await narratedVideo("burn-in");
  try {
    expect(video.output.meta.subtitlesMode).toBe("burn-in");
    expect(captionStripPeak(path, 1)).toBeLessThan(40);
    expect(captionStripPeak(path, 3)).toBeGreaterThan(150);
  } finally {
    h.close();
  }
}, 60_000);

const subtitlesOff = {
  mode: "off" as const,
  language: "en" as const,
  fontId: "default",
  fontSize: 48,
  position: "bottom" as const,
};

// A black still with a white bar across its middle, `bar` pixels wide.
function marker(path: string, bar: number): void {
  execFileSync(binary, [
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "color=black:s=640x360:d=1",
    "-f",
    "lavfi",
    "-i",
    `color=white:s=${String(bar)}x90:d=1`,
    "-filter_complex",
    "[0][1]overlay=(W-w)/2:(H-h)/2",
    "-frames:v",
    "1",
    "-f",
    "image2",
    "-c:v",
    "png",
    path,
  ]);
}

// How many pixels of the frame's middle row are bright at `seconds`.
function barWidthAt(path: string, seconds: number): number {
  const row = execFileSync(
    binary,
    [
      "-v",
      "error",
      "-ss",
      seconds.toFixed(3),
      "-i",
      path,
      "-frames:v",
      "1",
      "-vf",
      "crop=iw:1:0:ih/2,format=gray",
      "-f",
      "rawvideo",
      "pipe:1",
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );
  return row.filter((value) => value > 128).length;
}

it("zooms the first image in and the second one out, each within its own slot", async () => {
  const h = await exportFixture(false, pcm(2));
  try {
    const deps = { ...h.deps, ffmpeg: binary };
    for (const [id, bar] of [
      ["first", 200],
      ["second", 160],
    ] as const) {
      const path = join(h.deps.paths.staging, id);
      marker(path, bar);
      insertStagedFile(h.deps.db, {
        id,
        stageKind: "images",
        path: id,
        originalFilename: `${id}.png`,
        bytes: statSync(path).size,
        state: "staged",
        createdAt: h.deps.clock.now().toISOString(),
      });
    }
    const old = h.view();
    const saved = await saveRevision(h.deps, {
      projectId: h.projectId,
      baseRevisionId: old.revision.id,
      idempotencyKey: "zoom",
      edit: {
        config: {
          ...old.revision.config,
          sources: { ...old.revision.config.sources, images: "provide", video: "generate" },
          imageSeconds: 1,
          zoomPercent: 22.5,
          motionStyle: "zoom",
          subtitles: subtitlesOff,
        },
        content: {
          ...old.revision.content,
          imageOrder: ["one", "two"],
          imageDefinitions: {
            one: { source: "provide", assetId: null, prompt: null },
            two: { source: "provide", assetId: null, prompt: null },
          },
        },
        uploads: [
          { stagedFileId: "first", destination: { kind: "image", imageKey: "one" } },
          { stagedFileId: "second", destination: { kind: "image", imageKey: "two" } },
        ],
      },
    });
    if (!saved.ok) throw new Error(JSON.stringify(saved));
    const part = h.grant("export:video", saved.view.revision.id);
    expect(await executeExportRecipe(deps, part.context, part.piece)).toBe("done");
    const video = h
      .view(saved.view.revision.id)
      .outputs.find((row) => row.selected && row.output.role === "video");
    if (video === undefined) throw new Error("No video");
    const path = outputPath(h.deps.paths, h.projectId, video.output.path);
    // One-second slots: each zooms its whole range inside its own slot. A 200 px bar on a
    // 640 px still is 600 px in a 1920 px frame at zoom 1, a 160 px bar 480 px. The ends are
    // read just before the slot's last frame.
    const firstStart = barWidthAt(path, 0);
    const firstEnd = barWidthAt(path, 0.95);
    expect(firstStart).toBeCloseTo(600, -1);
    expect(firstEnd / firstStart).toBeCloseTo(1.225, 1);
    const secondStart = barWidthAt(path, 1.0);
    const secondEnd = barWidthAt(path, 1.95);
    expect(secondStart / 480).toBeCloseTo(1.225, 1);
    expect(secondEnd).toBeCloseTo(480, -1);
  } finally {
    h.close();
  }
}, 60_000);
