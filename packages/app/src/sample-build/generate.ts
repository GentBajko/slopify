import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { CatalogueStore } from "../catalog/store.js";
import { parseCatalogue } from "../catalog/store.js";
import { createHub } from "../edge/events/hub.js";
import { createAudioPreviewStore } from "../kernel/audio-preview.js";
import { systemClock } from "../kernel/clock.js";
import { openDb } from "../kernel/db/index.js";
import { migrate } from "../kernel/db/migrate.js";
import { ulidIds } from "../kernel/ids.js";
import { ensureDirs, layout } from "../kernel/paths.js";
import type { ImagePort } from "../kernel/ports/image.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../kernel/ports/llm.js";
import type { Registry } from "../kernel/ports/registry.js";
import type { TimedWord } from "../kernel/ports/subtitles.js";
import { wireRunner } from "../main.js";
import type { RunDraft } from "../slices/admission/model.js";
import { stagesOf } from "../slices/admission/repo.js";
import { admit } from "../slices/admission/rules.js";
import { startRun } from "../slices/admission/start.js";
import { insertPrompt } from "../slices/library/repo.js";
import { pickTemplates, renderPicked } from "../slices/library/slots.js";
import { planBackup, streamBackup } from "../slices/storage/backup-export.js";
import { insertStagedFile, stagedFiles } from "../slices/storage/repo.js";
import { defaultVideoEdit } from "../slices/video/edit-settings.js";
import { drawScene } from "./art.js";
import {
  sampleArticle,
  sampleImagePrompts,
  sampleThumbnailPrompt,
  sampleTitle,
  sceneOf,
} from "./content.js";
import { scriptedAnswer } from "./script.js";

// Builds the bundled sample project with Slopify's own pipeline, locally and for free: the
// article is supplied, the "text model" and "image model" are local scripts registered under
// the honest provider names sample-writer and sample-artist, the narration is an ambient
// track (no local voice was available to speak it; the captions carry the words), and the
// word timing paces the text at a reading speed. Everything after that - captions, the
// render with its cuts and chapter cards, the YouTube description, the two shorts and the
// PDF - is the real code path. The finished project is exported as a backup the app imports
// on first launch.
//
//   node packages/app/scripts/build-sample.mjs [--short] <out.tar>

const wordsPerMinute = 165;
const leadSeconds = 0.4;

async function main(): Promise<void> {
  const out = process.argv.at(-1);
  if (out === undefined || !out.endsWith(".tar"))
    throw new Error("Usage: build-sample.mjs [--short] <out.tar>");
  const short = process.argv.includes("--short");
  const root = mkdtempSync(join(tmpdir(), "slopify-sample-"));
  process.env.SAMPLE_SCRATCH = root;
  try {
    await build(join(root, "data"), out, short);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function build(dataDir: string, out: string, short: boolean): Promise<void> {
  const paths = layout(dataDir);
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  const ids = ulidIds;
  const clock = systemClock;
  const log = {
    write: (level: string, event: string, fields?: unknown): void => {
      if (level !== "info") console.warn(level, event, JSON.stringify(fields ?? {}));
    },
  };
  const ffmpeg = process.env.FFMPEG ?? "ffmpeg";
  const catalogue = staticCatalogue();

  const words = sampleWords();
  const seconds = words.length / (wordsPerMinute / 60) + leadSeconds + 1;
  const audioId = ids.next();
  writeFileSync(join(paths.staging, audioId), ambientTrack(ffmpeg, seconds, dataDir));
  insertStagedFile(db, {
    id: audioId,
    stageKind: "audio",
    path: audioId,
    originalFilename: "ambient.mp3",
    bytes: statSync(join(paths.staging, audioId)).size,
    state: "staged",
    createdAt: clock.now().toISOString(),
  });
  const at = clock.now().toISOString();
  for (const prompt of sampleImagePrompts)
    insertPrompt(db, {
      id: ids.next(),
      kind: "image",
      name: prompt.name,
      body: prompt.body,
      slots: [],
      updatedAt: at,
    });
  insertPrompt(db, {
    id: ids.next(),
    kind: "thumbnail",
    name: sampleThumbnailPrompt.name,
    body: sampleThumbnailPrompt.body,
    slots: [],
    updatedAt: at,
  });

  const draft: RunDraft = {
    ...(short ? { mode: "short" as const } : {}),
    title: short ? "Why the Library of Alexandria faded" : sampleTitle,
    format: short ? "9:16" : "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "provide",
      images: "generate",
      thumbnail: short ? "off" : "from_prompt",
      video: "generate",
      document: short ? "off" : "generate",
    },
    llm: { provider: "sample-writer", model: "scripted" },
    images: { provider: "sample-artist", model: "procedural" },
    imagePrompts: sampleImagePrompts.map((prompt) => ({ name: prompt.name, number: 1 })),
    ...(short ? {} : { thumbnailPrompt: sampleThumbnailPrompt.name }),
    values: {},
    provided: { article: sampleArticle, audio: audioId },
    silenceGapSeconds: 1,
    imageSeconds: short ? 12 : 35,
    zoomPercent: 12,
    motionStyle: "mixed",
    edgeSilenceSeconds: 1,
    subtitles: {
      mode: short ? "off" : "burn-in",
      language: "en",
      fontId: "default",
      fontSize: 52,
      position: "bottom",
    },
    ...(short
      ? {}
      : {
          youtubeDescription: true,
          shorts: {
            enabled: true,
            count: 2,
            minSeconds: 25,
            maxSeconds: 55,
            titleOnScreen: true,
          },
          videoEdit: {
            ...defaultVideoEdit,
            transition: "crossfade",
            transitionSeconds: 1,
            vignette: "subtle",
            grain: "subtle",
            grade: "warm",
            chapterCards: true,
          },
        }),
  };
  const picked = pickTemplates(db, draft);
  const admitted = admit({ draft: picked.draft, staged: stagedFiles(db), requiredSlots: [] });
  if (!admitted.ok || picked.missing.length > 0)
    throw new Error(`The sample draft was refused: ${JSON.stringify(admitted)}`);
  const storage = { db, paths, ids, clock, log, catalogue, emit: () => undefined };
  const { project } = startRun(
    storage,
    admitted.draft,
    renderPicked(picked, admitted.draft.values),
    false,
    Object.fromEntries(picked.bodies.map(({ key, body }) => [key, body])),
  );
  const hub = createHub({ ids, log });
  const runner = wireRunner({
    db,
    paths,
    clock,
    ids,
    log,
    hub,
    telemetry: { db, ids, clock, log, appVersion: "sample" },
    flusher: { soon: () => undefined, stop: () => undefined },
    registry: sampleRegistry(),
    catalogue,
    ffmpeg,
    audioPreviews: createAudioPreviewStore(),
    alignSubtitles: async (request) => paced(request.text, leadSeconds, seconds - 1),
  });
  runner.tick(project.id);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    const stages = stagesOf(db, project.id);
    const failed = stages.find((stage) => stage.state === "failed");
    if (failed !== undefined)
      throw new Error(`The sample's ${failed.kind} stage failed: ${failed.failureReason ?? ""}`);
    if (stages.every((stage) => ["done", "skipped", "provided"].includes(stage.state))) break;
  }
  await runner.settled();
  shrinkVideos(db, paths.projects, project.id, ffmpeg);
  // The sample carries its project only: no prompts, voices, settings or usage of the machine
  // that built it.
  for (const table of [
    "settings",
    "prompts",
    "entries",
    "voices",
    "staged_files",
    "telemetry_events",
  ])
    db.prepare(`DELETE FROM ${table}`).run();
  const plan = planBackup({ db, paths, clock, ids, appVersion: "sample" });
  await pipeline(Readable.from(streamBackup(plan)), createWriteStream(out));
  db.close();
  console.log(`${out}: ${String(statSync(out).size)} bytes, project ${project.id}`);
}

function sampleWords(): readonly string[] {
  return sampleArticle
    .split("\n")
    .filter((line) => !line.startsWith("#"))
    .join(" ")
    .split(/\s+/)
    .filter((word) => word !== "");
}

// The words of the transcript at a steady reading pace, with a breath after each sentence,
// fitted between the lead-in and `until`.
function paced(text: string, lead: number, until: number): readonly TimedWord[] {
  const words = text.split(/\s+/).filter((word) => word !== "");
  const spans: { text: string; start: number; end: number }[] = [];
  let at = 0;
  for (const word of words) {
    const length = 0.55 + Math.min(12, word.length) / 12;
    spans.push({ text: word, start: at, end: at + length * 0.9 });
    at += length + (/[.!?]$/.test(word) ? 0.6 : /[,;:]$/.test(word) ? 0.2 : 0);
  }
  const scale = (until - lead) / Math.max(1, at);
  return spans.map((span) => ({
    text: span.text,
    start: round(lead + span.start * scale),
    end: round(lead + span.end * scale),
  }));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

// A quiet ambient bed in place of a voice: a slow drone of soft sines under filtered noise
// that rises and falls like distant surf, faded in and out.
function ambientTrack(ffmpeg: string, seconds: number, dir: string): Buffer {
  const path = join(dir, "ambient.mp3");
  const duration = seconds.toFixed(2);
  execFileSync(
    ffmpeg,
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=f=110:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `sine=f=164.81:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `sine=f=220:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      `anoisesrc=c=pink:d=${duration}:a=0.5`,
      "-filter_complex",
      [
        swell(0, 0.1, 0.07, "a"),
        swell(1, 0.06, 0.05, "b"),
        swell(2, 0.035, 0.11, "c"),
        `[3:a]lowpass=f=700,highpass=f=80,${swell(3, 0.35, 0.09, "d").slice(5)}`,
        `[a][b][c][d]amix=inputs=4:normalize=0,aecho=0.6:0.5:900:0.3,afade=t=in:d=3,afade=t=out:st=${(seconds - 4).toFixed(2)}:d=4,pan=stereo|c0=c0|c1=c0[out]`,
      ].join(";"),
      "-map",
      "[out]",
      "-ar",
      "44100",
      "-b:a",
      "96k",
      path,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  return readFileSync(path);
}

// One input, its level rising and falling once every 1/`hertz` seconds.
function swell(input: number, level: number, hertz: number, label: string): string {
  return `[${String(input)}:a]volume='${String(level)}*(0.7+0.3*sin(2*PI*${String(hertz)}*t))':eval=frame[${label}]`;
}

function sampleRegistry(): Registry {
  const writer: LlmPort = {
    id: "sample-writer",
    capabilities: { streams: true, reportsUsage: false, webSearch: false },
    models: async () => [{ id: "scripted", name: "Scripted sample text" }],
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      const text = scriptedAnswer(request.messages);
      for (const part of text.match(/.{1,80}/gs) ?? []) yield { type: "delta", text: part };
      yield { type: "done", usage: null, finishReason: "stop" };
    },
  };
  const artist: ImagePort = {
    id: "sample-artist",
    models: async () => [{ id: "procedural", name: "Procedural art" }],
    generate: async (request) => ({
      bytes: drawScene(sceneOf(request.prompt), request.aspect, seedOf(request.prompt)),
      mime: "image/jpeg",
    }),
  };
  return {
    llm: (id) => {
      if (id !== writer.id) throw new Error(`The sample has no text model ${id}.`);
      return writer;
    },
    image: (id) => {
      if (id !== artist.id) throw new Error(`The sample has no image model ${id}.`);
      return artist;
    },
    tts: (id) => {
      throw new Error(`The sample has no voice ${id}.`);
    },
    list: async () => [],
  };
}

// The same prompt draws the same picture; a different one varies it.
function seedOf(text: string): number {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 997;
}

function staticCatalogue(): CatalogueStore {
  const value = parseCatalogue(
    readFileSync(
      join(process.env.SLOPIFY_APP_DIR ?? "packages/app", "src/assets/models.yaml"),
      "utf8",
    ),
  );
  return {
    read: () => value,
    models: (provider, family) => value[family].filter((row) => row.provider === provider),
    refresh: async () => undefined,
    status: () => ({
      updatedAt: value.updatedAt,
      path: "bundled",
      warning: null,
      source: "sample",
    }),
  };
}

// The pipeline renders at 1080p; the bundled copy is re-encoded smaller so the sample stays a
// few megabytes. Same length and frames, so every row that describes a video still does; the
// byte counts are updated to match.
function shrinkVideos(
  db: ReturnType<typeof openDb>,
  projects: string,
  projectId: string,
  ffmpeg: string,
): void {
  const rows = db
    .prepare(
      "SELECT id,path FROM project_assets WHERE project_id=? AND (path LIKE '%/video.mp4' OR path LIKE '%/short.mp4')",
    )
    .all(projectId);
  for (const row of rows) {
    const path = join(projects, projectId, String(row.path));
    const smaller = `${path}.small.mp4`;
    const vertical = String(row.path).endsWith("/short.mp4") || process.argv.includes("--short");
    execFileSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        path,
        "-vf",
        vertical ? "scale=720:1280" : "scale=1280:720",
        "-c:v",
        "libx264",
        "-preset",
        "slow",
        "-crf",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "64k",
        "-movflags",
        "+faststart",
        smaller,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    execFileSync("mv", [smaller, path]);
    const bytes = statSync(path).size;
    db.prepare("UPDATE project_assets SET bytes=? WHERE id=?").run(bytes, String(row.id));
    db.prepare(
      "UPDATE revision_outputs SET descriptor=json_set(descriptor,'$.bytes',?) WHERE asset_id=? AND json_extract(descriptor,'$.bytes') IS NOT NULL",
    ).run(bytes, String(row.id));
    db.prepare("UPDATE outputs SET bytes=? WHERE project_id=? AND path=?").run(
      bytes,
      projectId,
      String(row.path),
    );
  }
}

await main();
