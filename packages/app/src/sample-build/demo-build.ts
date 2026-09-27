import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import type { Ids } from "../kernel/ids.js";
import type { ImagePort } from "../kernel/ports/image.js";
import type { LlmCompletion, LlmEvent, LlmPort } from "../kernel/ports/llm.js";
import type { Registry } from "../kernel/ports/registry.js";
import type { AlignmentRequest, TimedWord } from "../kernel/ports/subtitles.js";
import type { TtsPort } from "../kernel/ports/tts.js";
import type { RunDraft } from "../slices/admission/model.js";
import { insertImageBlob } from "../slices/channels/repo.js";
import { insertPrompt } from "../slices/library/repo.js";
import { type LoudnessGoal, masterFile, masterReport } from "../slices/loudness/loudnorm.js";
import { defaultVideoEdit } from "../slices/video/edit-settings.js";
import type { Speaker } from "../slices/voices/model.js";
import { drawScene } from "./art.js";
import type { SampleScene } from "./content.js";
import { demoAnswer } from "./demo-script.js";
import { type DemoRequest, demoRequests, demoVoiceModel } from "./demo-turns.js";
import { type Demo, demoPrompt, demoSceneOf } from "./demos.js";

// A demo project's run (`build-sample.mjs --demo <id>`): its draft, and the registry that
// stands in for the providers. With an assets folder (how the bundled archives are made) the
// voices are the Inworld stock voices the turns were spoken with ahead of time (voices.ts),
// the pictures the Codex paintings (paint.ts) and the words are timed by the real aligner.
// Without one (CI) the turns are quiet tones, the pictures procedural and the words paced.
// The folder holds, per demo:
//   <scene>.jpg for each of the four scenes, 16:9      <vertical>-vertical.jpg, 9:16
//   portrait-<speaker>.jpg for each podcast host        turn-<hash>.mp3 and turns.json (voices.ts)

export interface DemoSetup {
  readonly draft: RunDraft;
  readonly registry: Registry;
  readonly alignSubtitles?:
    | ((request: AlignmentRequest) => Promise<readonly TimedWord[]>)
    | undefined;
}

// The provider names the stand-ins answer under. A painted build's voices are Inworld's:
// the audio really is Inworld TTS-2, so a copy can be rebuilt with the user's own key.
const toneVoice = { provider: "sample-voice", model: "tones" } as const;

export function demoSetup(input: {
  readonly db: DatabaseSync;
  readonly ids: Ids;
  readonly at: string;
  readonly ffmpeg: string;
  readonly scratch: string;
  readonly demo: Demo;
  readonly assets: string | undefined;
}): DemoSetup {
  const { db, ids, at, demo, assets } = input;
  const procedural = assets === undefined;
  const scenes = demo.scenes.map((scene) => ({
    ...scene,
    body: demoPrompt(demo, scene.subject, false, procedural),
  }));
  for (const scene of scenes)
    insertPrompt(db, {
      id: ids.next(),
      kind: "image",
      name: scene.name,
      body: scene.body,
      slots: [],
      updatedAt: at,
    });
  const thumbnail = scenes.find((scene) => scene.scene === demo.thumbnail) ?? scenes[0];
  const thumbnailName = "Demo · Thumbnail";
  insertPrompt(db, {
    id: ids.next(),
    kind: "thumbnail",
    name: thumbnailName,
    body: thumbnail?.body ?? "",
    slots: [],
    updatedAt: at,
  });
  const directionName = "Demo · Delivery";
  if (!procedural)
    insertPrompt(db, {
      id: ids.next(),
      kind: "narration",
      name: directionName,
      body: demo.direction,
      slots: [],
      updatedAt: at,
    });

  const speakers: Speaker[] = demo.speakers.map((speaker, index) => {
    const picture =
      assets === undefined || speaker.portrait === undefined
        ? undefined
        : readFileSync(join(assets, `portrait-${speaker.id}.jpg`));
    let portrait: string | undefined;
    if (picture !== undefined) {
      portrait = createHash("sha256").update(picture).digest("hex");
      insertImageBlob(db, { sha256: portrait, mime: "image/jpeg", bytes: picture }, at);
    }
    return {
      id: speaker.id,
      name: speaker.name,
      role: speaker.role,
      voice: procedural
        ? { ...toneVoice, voice: `tone-${String(index + 1)}` }
        : { provider: "inworld", model: demoVoiceModel, voice: speaker.voice },
      ...(portrait === undefined ? {} : { portrait }),
    };
  });
  const first = speakers[0]?.voice ?? { ...toneVoice, voice: "tone-1" };
  const draft: RunDraft = {
    title: demo.title,
    format: "16:9",
    sources: {
      research: "off",
      article: "provide",
      audio: "generate",
      images: "generate",
      thumbnail: "from_prompt",
      video: "generate",
      document: "off",
    },
    llm: { provider: "sample-writer", model: "scripted" },
    audio: first,
    images: { provider: "sample-artist", model: procedural ? "procedural" : "codex-painted" },
    imagePrompts: scenes.map((scene) => ({ name: scene.name, number: 1 })),
    thumbnailPrompt: thumbnailName,
    ...(procedural ? {} : { narrationPrompt: directionName }),
    values: {},
    provided: { article: demo.article },
    voices: {
      format: demo.format,
      source: demo.attributed === undefined ? "script" : "attribute",
      speakers,
      turnGapSeconds: 0.35,
      nameTags: true,
      nativeDialogue: true,
      audioFiles: true,
    },
    // Level the volume at the recommended targets and pace the sentences, as every new run.
    loudness: { videoLufs: -14, audioFilesLufs: -18 },
    ...(procedural ? {} : { sentencePauseSeconds: demo.sentencePause }),
    silenceGapSeconds: 1,
    imageSeconds: demo.imageSeconds,
    zoomPercent: 12,
    motionStyle: "mixed",
    edgeSilenceSeconds: 1,
    subtitles: {
      mode: "burn-in",
      language: "en",
      fontId: "default",
      fontSize: 52,
      position: "bottom",
    },
    youtubeDescription: true,
    shorts: { enabled: true, count: 1, minSeconds: 25, maxSeconds: 60, titleOnScreen: true },
    videoEdit: {
      ...defaultVideoEdit,
      transition: "crossfade",
      transitionSeconds: 1,
      vignette: "subtle",
      // No film grain: noise is what a video encoder spends the most bytes on.
      grain: "off",
      grade: demo.format === "podcast" ? "none" : "warm",
      chapterCards: true,
    },
  };
  const requests = procedural ? [] : demoRequests(demo);
  return {
    draft,
    registry: demoRegistry(input, requests),
    ...(procedural
      ? { alignSubtitles: (request: AlignmentRequest) => paced(input.ffmpeg, request) }
      : {}),
  };
}

function demoRegistry(
  input: Parameters<typeof demoSetup>[0],
  requests: readonly DemoRequest[],
): Registry {
  const { demo, assets, ffmpeg, scratch } = input;
  const procedural = assets === undefined;
  const writer: LlmPort = {
    id: "sample-writer",
    capabilities: { streams: true, reportsUsage: false, webSearch: false },
    models: async () => [{ id: "scripted", name: "Scripted sample text" }],
    complete: async function* (request: LlmCompletion): AsyncGenerator<LlmEvent> {
      const text = demoAnswer(demo, request.messages, procedural);
      for (const part of text.match(/.{1,80}/gs) ?? []) yield { type: "delta", text: part };
      yield { type: "done", usage: null, finishReason: "stop" };
    },
  };
  const artist: ImagePort = {
    id: "sample-artist",
    models: async () => [
      procedural
        ? { id: "procedural", name: "Procedural art" }
        : { id: "codex-painted", name: "Painted by the Codex CLI" },
    ],
    generate: async (request) => {
      const scene = demoSceneOf(demo, request.prompt);
      if (assets === undefined) {
        const index = Math.max(
          0,
          demo.scenes.findIndex((one) => one.scene === scene),
        );
        const art: readonly SampleScene[] = ["harbor", "scrolls", "embers", "disc"];
        return {
          bytes: drawScene(
            art[index % art.length] ?? "harbor",
            request.aspect,
            seedOf(request.prompt),
          ),
          mime: "image/jpeg",
        };
      }
      return { bytes: painted(assets, scratch, scene, request.aspect), mime: "image/jpeg" };
    },
  };
  const voice: TtsPort = {
    id: procedural ? toneVoice.provider : "inworld",
    capabilities: { streams: false },
    models: async () =>
      procedural
        ? [{ id: toneVoice.model, name: "Quiet tones" }]
        : [{ id: demoVoiceModel, name: "Realtime TTS-2" }],
    synthesize: async (request) => {
      const bytes = procedural
        ? tone(ffmpeg, scratch, request.text, request.voiceId)
        : spoken(assets, requests, request.voiceId, request.text);
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
  return {
    llm: (id) => {
      if (id !== writer.id) throw new Error(`The demo has no text model ${id}.`);
      return writer;
    },
    image: (id) => {
      if (id !== artist.id) throw new Error(`The demo has no image model ${id}.`);
      return artist;
    },
    tts: (id) => {
      if (id !== voice.id) throw new Error(`The demo has no voice ${id}.`);
      return voice;
    },
    list: async () => [],
  };
}

// The turn spoken ahead of time for exactly this request: same voice, same words and tags.
function spoken(
  folder: string,
  requests: readonly DemoRequest[],
  voiceId: string,
  text: string,
): Uint8Array {
  const match = requests.find((one) => one.voice === voiceId && one.text === text);
  if (match === undefined)
    throw new Error(
      `No turn was spoken for ${voiceId}: "${text.slice(0, 80)}". Run voices.ts for this demo again.`,
    );
  return readFileSync(join(folder, match.file));
}

// A painting from the folder at the archive's 720p: tall for a 9:16 request, from the scene's
// own tall painting or cropped from its wide one.
function painted(folder: string, scratch: string, scene: string, aspect: string): Uint8Array {
  const vertical = aspect === "9:16";
  const tall = join(folder, `${scene}-vertical.jpg`);
  const out = join(scratch, `${scene}${vertical ? "-tall" : ""}-720.jpg`);
  if (!existsSync(out))
    execFileSync("magick", [
      vertical && existsSync(tall) ? tall : join(folder, `${scene}.jpg`),
      ...(vertical && !existsSync(tall)
        ? ["-gravity", "center", "-crop", "608x1080+0+0", "+repage"]
        : []),
      "-resize",
      vertical ? "720x1280!" : "1280x720!",
      "-quality",
      "72",
      out,
    ]);
  return readFileSync(out);
}

// The small mono encodes below lift the peaks well over the pipeline's own (measured: about
// 1 dB for 64 kbps MP3, 1.5 dB for 48 kbps AAC), so the listening files' sound is held this much
// lower before them, to ship under the -3 dBTP audiobook shops ask.
const smallFilePeak = { mp3: -4.5, m4b: -5 } as const;

// The pipeline writes its narration files at 128 kbps stereo-ready MP3 and 96 kbps AAC; the
// bundled demo carries them as 64 kbps mono MP3 and 48 kbps AAC (speech needs no more), with
// their chapters, so the archive stays a few megabytes. Same length and words; the byte counts
// are updated to match, as for the videos. With Level the volume on, the listening files are
// mastered again, mono, before the smaller encode.
export async function shrinkAudio(
  db: DatabaseSync,
  projects: string,
  projectId: string,
  ffmpeg: string,
  master?: LoudnessGoal,
): Promise<void> {
  const rows = db
    .prepare(
      "SELECT id,path FROM project_assets WHERE project_id=? AND (path LIKE '%.mp3' OR path LIKE '%.m4b')",
    )
    .all(projectId);
  const files = new Set(
    db
      .prepare(
        "SELECT DISTINCT asset_id FROM revision_outputs WHERE project_id=? AND work_key='voices:files'",
      )
      .all(projectId)
      .map((row) => String(row.asset_id)),
  );
  for (const row of rows) {
    const path = join(projects, projectId, String(row.path));
    if (!existsSync(path)) continue;
    const m4b = String(row.path).endsWith(".m4b");
    const smaller = `${path}.small.${m4b ? "m4b" : "mp3"}`;
    // The listening files only: a narration join is levelled, never mastered.
    const listening = files.has(String(row.id));
    const mastered = `${path}.master.wav`;
    const run = {
      bin: ffmpeg,
      log: { write: () => undefined },
      signal: new AbortController().signal,
    };
    if (master !== undefined && listening)
      await masterFile(
        run,
        path,
        mastered,
        { ...master, truePeak: smallFilePeak[m4b ? "m4b" : "mp3"] },
        {
          sampleRate: 44100,
          channels: 1,
        },
      );
    const source = master !== undefined && listening ? mastered : path;
    execFileSync(
      ffmpeg,
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        ...(source === path ? [] : ["-i", path]),
        "-map",
        "0:a",
        "-map_metadata",
        source === path ? "0" : "1",
        "-map_chapters",
        source === path ? "0" : "1",
        "-ac",
        "1",
        ...(m4b
          ? ["-c:a", "aac", "-b:a", "48k", "-movflags", "+faststart", "-f", "mp4"]
          : ["-c:a", "libmp3lame", "-b:a", "64k", "-id3v2_version", "3", "-f", "mp3"]),
        smaller,
      ],
      { stdio: ["ignore", "ignore", "inherit"] },
    );
    execFileSync("mv", [smaller, path]);
    rmSync(mastered, { force: true });
    const bytes = statSync(path).size;
    db.prepare("UPDATE project_assets SET bytes=? WHERE id=?").run(bytes, String(row.id));
    db.prepare(
      "UPDATE revision_outputs SET descriptor=json_set(descriptor,'$.bytes',?) WHERE asset_id=? AND json_extract(descriptor,'$.bytes') IS NOT NULL",
    ).run(bytes, String(row.id));
    if (master !== undefined && listening) {
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

// A quiet tone as long as the words would take to say, a different pitch for each speaker.
function tone(ffmpeg: string, scratch: string, text: string, voiceId: string): Uint8Array {
  const words = text.split(/\s+/).filter((word) => word !== "").length;
  const length = Math.max(1, words / 2.6);
  const seconds = length.toFixed(2);
  const pitch = 180 + 60 * Number(/(\d+)$/.exec(voiceId)?.[1] ?? 1);
  const path = join(scratch, `tone-${String(Date.now())}-${String(Math.random()).slice(2)}.mp3`);
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
      `sine=f=${String(pitch)}:d=${seconds}`,
      "-af",
      `volume=0.05,afade=t=in:d=0.2,afade=t=out:st=${(length - 0.2).toFixed(2)}:d=0.2`,
      "-ar",
      "44100",
      "-b:a",
      "64k",
      path,
    ],
    { stdio: ["ignore", "ignore", "inherit"] },
  );
  return readFileSync(path);
}

// The words at a steady pace over the narration's real length (CI has no voice to listen to).
async function paced(ffmpeg: string, request: AlignmentRequest): Promise<readonly TimedWord[]> {
  // ffmpeg reports how far it decoded on stderr.
  const probe = spawnSync(ffmpeg, ["-hide_banner", "-i", request.audioPath, "-f", "null", "-"], {
    encoding: "utf8",
  }).stderr;
  const duration = /time=(\d+):(\d+):(\d+\.\d+)/g;
  let last = 0;
  for (const match of probe.matchAll(duration))
    last = Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  const words = request.text.split(/\s+/).filter((word) => word !== "");
  const step = Math.max(0.2, (last - 0.4) / Math.max(1, words.length));
  return words.map((text, index) => ({
    text,
    start: Math.round((0.2 + index * step) * 1000) / 1000,
    end: Math.round((0.2 + index * step + step * 0.9) * 1000) / 1000,
  }));
}

// The same prompt draws the same picture; a different one varies it.
function seedOf(text: string): number {
  let hash = 7;
  for (const char of text) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  return hash % 997;
}
