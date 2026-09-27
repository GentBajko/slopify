import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
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
import type { TtsPort } from "../kernel/ports/tts.js";
import { wireRunner } from "../main.js";
import type { RunDraft } from "../slices/admission/model.js";
import { stagesOf } from "../slices/admission/repo.js";
import { admit } from "../slices/admission/rules.js";
import { startRun } from "../slices/admission/start.js";
import { insertPrompt } from "../slices/library/repo.js";
import { pickTemplates, renderPicked } from "../slices/library/slots.js";
import { type LoudnessGoal, masterFile, masterReport } from "../slices/loudness/loudnorm.js";
import { masterGoal } from "../slices/loudness/model.js";
import { planBackup, streamBackup } from "../slices/storage/backup-export.js";
import { insertStagedFile, stagedFiles } from "../slices/storage/repo.js";
import { defaultVideoEdit } from "../slices/video/edit-settings.js";
import { drawScene } from "./art.js";
import {
  type SampleStyle,
  sampleArticle,
  sampleDirection,
  sampleImagePrompts,
  sampleThumbnailPrompt,
  sampleThumbnailSubject,
  sampleTitle,
  sampleVoice,
  sceneOf,
} from "./content.js";
import { type DemoSetup, demoSetup, shrinkAudio } from "./demo-build.js";
import { type DemoRequest, requestFile } from "./demo-turns.js";
import { type Demo, demoOf } from "./demos.js";
import { scriptedAnswer } from "./script.js";
import { underCeiling } from "./shrink.js";

// Builds the bundled sample project with Slopify's own pipeline: the article is supplied and
// the "text model" is a local script registered under the honest provider name sample-writer.
//
// With `--assets <folder>` (how the bundled archive is made) the narration and pictures are
// made ahead of time and read from the folder:
//   turn-<hash>.mp3 and turns.json                the narration's requests, spoken by
//                                                  Tristan on Inworld TTS-2 (voices.ts --library)
//   harbor.jpg scrolls.jpg embers.jpg disc.jpg     the four scenes, 16:9
//   harbor-vertical.jpg … disc-vertical.jpg        the same scenes, 9:16, for the shorts
//   thumbnail.jpg                                  16:9
// (`paint.ts` paints the pictures with the Codex CLI; docs/first-five-minutes.md says how the
// narration was made.) The pictures are served by the sample-artist provider as model
// codex-painted, and the words are timed against the narration by the real English aligner,
// which downloads its model on first use.
//
// Without a folder (CI, or a machine with no provider) everything stays local and free: the
// pictures are procedural art drawn by art.ts, the narration is an ambient track (the
// captions carry the words), and the word timing paces the text at a reading speed.
//
// Everything after that - captions, the render with its cuts and chapter cards, the YouTube
// description, the two shorts and the PDF - is the real code path. The finished project is
// exported as a backup the app imports on first launch.
//
//   node packages/app/scripts/build-sample.mjs [--short] [--assets <folder>] <out.tar>
//
// `--demo <audiobook|podcast>` builds one of the multi-voice demos instead (`demo-build.ts`).

// The bundled copies' smaller encodes lift the peaks more than the pipeline's own, so their
// sound is held this much lower before them (measured: 64 kbps AAC adds 2 to 3 dB).
const smallAacPeak = -5;

const wordsPerMinute = 165;
const leadSeconds = 0.4;

async function main(): Promise<void> {
  const out = process.argv.at(-1);
  if (out === undefined || !out.endsWith(".tar"))
    throw new Error(
      "Usage: build-sample.mjs [--short | --demo <id>] [--assets <folder>] <out.tar>",
    );
  const short = process.argv.includes("--short");
  const flag = process.argv.indexOf("--assets");
  const assets = flag === -1 ? undefined : process.argv[flag + 1];
  if (flag !== -1 && (assets === undefined || assets.endsWith(".tar")))
    throw new Error("--assets needs the folder that holds the narration and the pictures.");
  const demoFlag = process.argv.indexOf("--demo");
  const demo = demoFlag === -1 ? undefined : demoOf(process.argv[demoFlag + 1] ?? "");
  const root = mkdtempSync(join(tmpdir(), "slopify-sample-"));
  process.env.SAMPLE_SCRATCH = root;
  try {
    await build(join(root, "data"), out, short, assets, demo);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

async function build(
  dataDir: string,
  out: string,
  short: boolean,
  assets: string | undefined,
  demo: Demo | undefined,
): Promise<void> {
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
  const setup =
    demo === undefined
      ? librarySetup({ db, ids, clock, paths, ffmpeg, dataDir, short, assets })
      : demoSetup({
          db,
          ids,
          at: clock.now().toISOString(),
          ffmpeg,
          scratch: dataDir,
          demo,
          assets,
        });
  const draft = setup.draft;
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
    registry: setup.registry,
    catalogue,
    ffmpeg,
    audioPreviews: createAudioPreviewStore(),
    // A real narration is timed by the real aligner, wireRunner's default.
    ...(setup.alignSubtitles === undefined ? {} : { alignSubtitles: setup.alignSubtitles }),
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
  // A demo carries three voices' audio files as well, so it is squeezed harder to stay under
  // 10 MB.
  await shrinkVideos(
    db,
    paths.projects,
    project.id,
    ffmpeg,
    demo === undefined ? 30 : 41,
    masterGoal(setup.draft, "video"),
  );
  // A spoken narration's pieces and joins are squeezed too (the Library's as well as a demo's).
  if (demo !== undefined || (assets !== undefined && !short))
    await shrinkAudio(
      db,
      paths.projects,
      project.id,
      ffmpeg,
      masterGoal(setup.draft, "audioFiles"),
    );
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

// The Library of Alexandria's run: the narration uploaded (or an ambient track), the article
// supplied, the pictures painted ahead of time (or drawn procedurally).
function librarySetup(input: {
  readonly db: ReturnType<typeof openDb>;
  readonly ids: typeof ulidIds;
  readonly clock: typeof systemClock;
  readonly paths: ReturnType<typeof layout>;
  readonly ffmpeg: string;
  readonly dataDir: string;
  readonly short: boolean;
  readonly assets: string | undefined;
}): DemoSetup {
  const { db, ids, clock, paths, ffmpeg, dataDir, short, assets } = input;
  const style: SampleStyle = assets === undefined ? "procedural" : "painted";

  const seconds = sampleWords().length / (wordsPerMinute / 60) + leadSeconds + 1;
  // With a pictures folder the narration is spoken: Tristan on Inworld TTS-2, one request per
  // paragraph, each prepared with delivery cues, levelled and paced like any new run. Without
  // one (CI) an ambient track is uploaded in its place.
  const spoken = assets !== undefined;
  const audioId = ids.next();
  if (!spoken) {
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
  }
  const at = clock.now().toISOString();
  const directionName = "Sample · Delivery";
  if (spoken)
    insertPrompt(db, {
      id: ids.next(),
      kind: "narration",
      name: directionName,
      body: sampleDirection,
      slots: [],
      updatedAt: at,
    });
  const imagePrompts = sampleImagePrompts(style);
  const thumbnailPrompt = sampleThumbnailPrompt(style);
  for (const prompt of imagePrompts)
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
    name: thumbnailPrompt.name,
    body: thumbnailPrompt.body,
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
      audio: spoken ? "generate" : "provide",
      images: "generate",
      thumbnail: short ? "off" : "from_prompt",
      video: "generate",
      document: short ? "off" : "generate",
    },
    llm: { provider: "sample-writer", model: "scripted" },
    images: {
      provider: "sample-artist",
      model: assets === undefined ? "procedural" : "codex-painted",
    },
    imagePrompts: imagePrompts.map((prompt) => ({ name: prompt.name, number: 1 })),
    ...(short ? {} : { thumbnailPrompt: thumbnailPrompt.name }),
    values: {},
    provided: { article: sampleArticle, ...(spoken ? {} : { audio: audioId }) },
    ...(spoken
      ? {
          audio: { ...sampleVoice },
          narrationPrompt: directionName,
          chunking: { mode: "paragraph" as const },
          // A documentary's pace between sentences (`narration/pauses-model.ts`).
          sentencePauseSeconds: 0.45,
        }
      : {}),
    // Level the volume at the recommended targets, as every new run starts.
    loudness: { videoLufs: -14, audioFilesLufs: -18 },
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
  return {
    draft,
    registry: sampleRegistry(style, assets),
    ...(assets === undefined
      ? {
          alignSubtitles: async (request: { readonly text: string }) =>
            paced(request.text, leadSeconds, seconds - 1),
        }
      : {}),
  };
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

// A picture from the assets folder: the thumbnail by its subject, every other prompt by the
// scene its words name, tall for a 9:16 request.
function paintedPicture(folder: string, prompt: string, aspect: string): Uint8Array {
  const file = prompt.includes(sampleThumbnailSubject)
    ? "thumbnail.jpg"
    : `${sceneOf(prompt)}${aspect === "9:16" ? "-vertical" : ""}.jpg`;
  return readFileSync(join(folder, file));
}

function sampleRegistry(style: SampleStyle, assets: string | undefined): Registry {
  const writer: LlmPort = {
    id: "sample-writer",
    capabilities: { streams: true, reportsUsage: false, webSearch: false },
    models: async () => [{ id: "scripted", name: "Scripted sample text" }],
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      const text = scriptedAnswer(request.messages, style);
      for (const part of text.match(/.{1,80}/gs) ?? []) yield { type: "delta", text: part };
      yield { type: "done", usage: null, finishReason: "stop" };
    },
  };
  const artist: ImagePort = {
    id: "sample-artist",
    models: async () => [
      assets === undefined
        ? { id: "procedural", name: "Procedural art" }
        : { id: "codex-painted", name: "Painted by the Codex CLI" },
    ],
    generate: async (request) => ({
      bytes:
        assets === undefined
          ? drawScene(sceneOf(request.prompt), request.aspect, seedOf(request.prompt))
          : paintedPicture(assets, request.prompt, request.aspect),
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
      if (assets === undefined || id !== sampleVoice.provider)
        throw new Error(`The sample has no voice ${id}.`);
      return spokenVoice(assets);
    },
    list: async () => [],
  };
}

// The Library's narrator: each request answered with the file spoken for exactly its voice
// and words ahead of time (`voices.ts --library`). With SAMPLE_RECORD set to a file, a request
// with no file yet is written there and answered with a quiet tone instead, so a first build
// lists what to speak.
function spokenVoice(folder: string): TtsPort {
  return {
    id: sampleVoice.provider,
    capabilities: { streams: false },
    models: async () => [{ id: sampleVoice.model, name: "Realtime TTS-2" }],
    synthesize: async (request) => {
      const file = requestFile(request.voiceId, request.text);
      const path = join(folder, file);
      let bytes: Uint8Array;
      if (existsSync(path)) bytes = readFileSync(path);
      else {
        const record = process.env.SAMPLE_RECORD;
        if (record === undefined)
          throw new Error(
            `No request was spoken for ${request.voiceId}: "${request.text.slice(0, 80)}". Build once with SAMPLE_RECORD=<file>, then run voices.ts --library.`,
          );
        recorded.push({
          turn: recorded.length + 1,
          speaker: "narrator",
          voice: request.voiceId,
          model: request.model ?? sampleVoice.model,
          text: request.text,
          spokenText: request.text,
          file,
        });
        writeFileSync(record, `${JSON.stringify(recorded, null, 2)}\n`);
        bytes = quietTone(folder, request.text);
      }
      return {
        container: "mp3",
        audio: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(bytes);
            controller.close();
          },
        }),
      };
    },
  };
}

const recorded: DemoRequest[] = [];

// A stand-in while recording: a second of quiet tone per few words.
function quietTone(folder: string, text: string): Uint8Array {
  const seconds = Math.max(1, text.split(/\s+/).length / 2.6);
  const path = join(folder, ".record-tone.mp3");
  execFileSync(process.env.FFMPEG ?? "ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=f=220:d=${seconds.toFixed(2)}`,
    "-af",
    "volume=0.05",
    path,
  ]);
  const bytes = readFileSync(path);
  rmSync(path, { force: true });
  return bytes;
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
// With Level the volume on, the sound is mastered again before the smaller AAC, with the
// peaks held lower: 64 kbps lifts them about 2 dB more than the pipeline's own encode, and the
// file that ships is what has to stay under the ceiling. The output's master report is measured
// again from the file that ships.
async function shrinkVideos(
  db: ReturnType<typeof openDb>,
  projects: string,
  projectId: string,
  ffmpeg: string,
  crf = 30,
  master?: LoudnessGoal,
): Promise<void> {
  const rows = db
    .prepare(
      "SELECT id,path FROM project_assets WHERE project_id=? AND (path LIKE '%/video.mp4' OR path LIKE '%/short.mp4')",
    )
    .all(projectId);
  for (const row of rows) {
    const path = join(projects, projectId, String(row.path));
    const smaller = `${path}.small.mp4`;
    const vertical = String(row.path).endsWith("/short.mp4") || process.argv.includes("--short");
    const sound = `${path}.master.wav`;
    const run = {
      bin: ffmpeg,
      log: { write: () => undefined },
      signal: new AbortController().signal,
    };
    const encode = (): void => {
      execFileSync(
        ffmpeg,
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          path,
          ...(master === undefined ? [] : ["-i", sound, "-map", "0:v:0", "-map", "1:a:0"]),
          "-vf",
          vertical ? "scale=720:1280" : "scale=1280:720",
          "-c:v",
          "libx264",
          "-preset",
          crf > 30 ? "veryslow" : "slow",
          "-crf",
          String(crf),
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
    };
    if (master === undefined) encode();
    else
      await underCeiling(run, smallAacPeak, master, smaller, async (peak) => {
        await masterFile(
          run,
          path,
          sound,
          { ...master, truePeak: peak },
          {
            sampleRate: 44100,
            channels: 2,
          },
        );
        encode();
      });
    execFileSync("mv", [smaller, path]);
    rmSync(sound, { force: true });
    const bytes = statSync(path).size;
    db.prepare("UPDATE project_assets SET bytes=? WHERE id=?").run(bytes, String(row.id));
    db.prepare(
      "UPDATE revision_outputs SET descriptor=json_set(descriptor,'$.bytes',?) WHERE asset_id=? AND json_extract(descriptor,'$.bytes') IS NOT NULL",
    ).run(bytes, String(row.id));
    if (master !== undefined) {
      const report = JSON.stringify(await masterReport(run, path, master));
      db.prepare(
        "UPDATE revision_outputs SET descriptor=json_set(descriptor,'$.meta.master',json(?)) WHERE asset_id=? AND json_extract(descriptor,'$.meta.master') IS NOT NULL",
      ).run(report, String(row.id));
      db.prepare(
        "UPDATE outputs SET meta=json_set(meta,'$.master',json(?)) WHERE project_id=? AND path=? AND json_extract(meta,'$.master') IS NOT NULL",
      ).run(report, projectId, String(row.path));
    }
    db.prepare("UPDATE outputs SET bytes=? WHERE project_id=? AND path=?").run(
      bytes,
      projectId,
      String(row.path),
    );
  }
}

await main();
