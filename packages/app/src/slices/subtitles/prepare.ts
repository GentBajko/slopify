import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { z } from "zod";
import type { SubtitleOmission } from "../../kernel/ports/subtitles.js";
import type { StageContext } from "../../kernel/runner/index.js";
import { projectById, setStageProgress } from "../admission/repo.js";
import { resolveFont } from "../fonts/index.js";
import { outputPath, projectDir } from "../storage/layout.js";
import type { Output } from "../storage/model.js";
import { outputsOf } from "../storage/repo.js";
import type { AudioSegment } from "../video/plan.js";
import type { VideoDeps } from "../video/run.js";
import { captionCues, serializeAss, serializeSrt, serializeVtt } from "./captions.js";
import { defaultSubtitles, type TimedWord } from "./model.js";
import { spokenText } from "./transcript.js";

export const subtitleRoles = [
  "subtitles_srt",
  "subtitles_vtt",
  "subtitle_words",
  "subtitle_ass",
  "subtitle_font",
] as const;
export interface SubtitleAsset {
  readonly role: (typeof subtitleRoles)[number];
  readonly path: string;
}
export interface PreparedSubtitles {
  readonly directory: string;
  readonly burnIn: boolean;
  readonly omissions?: readonly SubtitleOmission[];
  readonly assets: readonly SubtitleAsset[];
}
const wordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  confidence: z.number().optional(),
});
const fontSchema = z.object({
  id: z.string(),
  name: z.string(),
  assName: z.string(),
  extension: z.enum([".ttf", ".otf", ".ttc"]),
});
const cacheSchema = z.object({
  key: z.string(),
  words: z.array(wordSchema),
  font: fontSchema,
  omissions: z
    .array(z.object({ start: z.number().finite().nonnegative(), text: z.string() }))
    .default([]),
});
type Cache = z.infer<typeof cacheSchema>;

// Preparation writes into a new directory; only writeExport commits its output rows.
// The old caption files/font/timing stay usable if alignment or rendering fails.
export async function prepareSubtitles(
  deps: VideoDeps,
  context: StageContext,
  audio: readonly AudioSegment[],
  frame: { readonly width: number; readonly height: number },
): Promise<PreparedSubtitles | undefined> {
  const { projectId } = context.stage;
  const project = projectById(deps.db, projectId);
  if (project === undefined) throw new Error("The project no longer exists.");
  const config = project.config.subtitles ?? defaultSubtitles;
  if (config.mode === "off") return undefined;
  if (audio.length === 0) throw new Error("Subtitles need narration audio.");
  const outputs = outputsOf(deps.db, projectId);
  const segments = audio.map((segment) => ({
    ...segment,
    text: segment.kind === "gap" ? "" : spokenText(deps, projectId, segment.kind, outputs),
  }));
  const key = await timingKey(segments, context.signal);
  const cache = readCache(deps, projectId, outputs);
  const dir = projectDir(deps.paths, projectId);
  const directory = mkdtempSync(join(dir, "captions-"));
  try {
    const font = await snapshotFont(deps, projectId, outputs, config.fontId, cache, directory);
    const omissions: SubtitleOmission[] = cache?.key === key ? [...cache.omissions] : [];
    const words =
      cache?.key === key ? cache.words : await alignSegments(deps, context, segments, omissions);
    context.signal.throwIfAborted();
    const cues = captionCues(words);
    if (cues.length === 0)
      throw new Error(
        "No spoken words could be aligned. Check that the English article matches the audio.",
      );
    writeFileSync(join(directory, "subtitles.srt"), serializeSrt(cues), { mode: 0o600 });
    writeFileSync(join(directory, "subtitles.vtt"), serializeVtt(cues), { mode: 0o600 });
    writeFileSync(
      join(directory, "subtitles.ass"),
      serializeAss(cues, {
        ...frame,
        fontSize: config.fontSize,
        fontName: font.assName,
        position: config.position,
      }),
      { mode: 0o600 },
    );
    writeFileSync(
      join(directory, "subtitles.json"),
      JSON.stringify({ key, words, font, omissions }),
      {
        mode: 0o600,
      },
    );
    const files: readonly [(typeof subtitleRoles)[number], string][] = [
      ["subtitles_srt", "subtitles.srt"],
      ["subtitles_vtt", "subtitles.vtt"],
      ["subtitle_words", "subtitles.json"],
      ["subtitle_ass", "subtitles.ass"],
      ["subtitle_font", `fonts/selected${font.extension}`],
    ];
    return {
      directory,
      omissions,
      burnIn: config.mode === "burn-in" && project.config.sources.video !== "off",
      assets: files.map(([role, path]) => ({
        role,
        path: relative(dir, join(directory, path)).split(sep).join("/"),
      })),
    };
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

interface SpokenSegment extends AudioSegment {
  readonly text: string;
}
async function timingKey(segments: readonly SpokenSegment[], signal: AbortSignal): Promise<string> {
  // Bump when alignment normalization/model changes. Hash file contents, not timestamps.
  const hash = createHash("sha256").update("wav2vec2-en-a19f851-v2-omissions");
  for (const segment of segments) {
    signal.throwIfAborted();
    hash.update(
      JSON.stringify({ kind: segment.kind, seconds: segment.seconds, text: segment.text }),
    );
    if (segment.path !== null) {
      const stream = createReadStream(segment.path, { signal });
      for await (const chunk of stream) hash.update(chunk);
    }
  }
  return hash.digest("hex");
}
async function alignSegments(
  deps: VideoDeps,
  context: StageContext,
  segments: readonly SpokenSegment[],
  omissions: SubtitleOmission[],
): Promise<readonly TimedWord[]> {
  if (deps.alignSubtitles === undefined)
    throw new Error("Local subtitle alignment is unavailable in this build.");
  const words: TimedWord[] = [];
  const total = segments.reduce((sum, segment) => sum + segment.seconds, 0);
  let offset = 0;
  for (const segment of segments) {
    context.signal.throwIfAborted();
    if (segment.path !== null) {
      const aligned = await deps.alignSubtitles({
        audioPath: segment.path,
        onOmission: (omission) => omissions.push({ ...omission, start: omission.start + offset }),
        text: segment.text,
        cacheDir: join(deps.paths.dataDir, "models", "english-subtitles"),
        ffmpeg: deps.ffmpeg,
        signal: context.signal,
        onProgress: (current, maximum) => {
          const progress = Math.round(
            (35 * (offset + segment.seconds * (maximum > 0 ? current / maximum : 0))) / total,
          );
          setStageProgress(deps.db, context.stage.id, progress, 100);
          context.emit({
            type: "stage.progress",
            projectId: context.stage.projectId,
            stage: "video",
            current: progress,
            total: 100,
          });
        },
      });
      for (const word of aligned) {
        if (word.end > segment.seconds + 0.1)
          throw new Error("Subtitle timing exceeds the narration duration.");
        words.push({
          ...word,
          start: word.start + offset,
          end: Math.min(word.end, segment.seconds) + offset,
        });
      }
    }
    offset += segment.seconds;
  }
  return words;
}
function readCache(
  deps: VideoDeps,
  projectId: string,
  outputs: readonly Output[],
): Cache | undefined {
  const output = outputs.find((one) => one.role === "subtitle_words");
  if (output === undefined) return undefined;
  try {
    return cacheSchema.parse(
      JSON.parse(readFileSync(outputPath(deps.paths, projectId, output.path), "utf8")),
    );
  } catch {
    return undefined;
  }
}
async function snapshotFont(
  deps: VideoDeps,
  projectId: string,
  outputs: readonly Output[],
  id: string,
  cache: Cache | undefined,
  directory: string,
): Promise<Cache["font"]> {
  const previous = outputs.find((one) => one.role === "subtitle_font");
  const previousPath =
    previous === undefined ? undefined : outputPath(deps.paths, projectId, previous.path);
  const saved =
    cache?.font.id === id && previousPath !== undefined && existsSync(previousPath)
      ? { ...cache.font, path: previousPath }
      : await resolveFont(deps.paths, id);
  mkdirSync(join(directory, "fonts"), { mode: 0o700 });
  copyFileSync(saved.path, join(directory, "fonts", `selected${saved.extension}`));
  return { id: saved.id, name: saved.name, assName: saved.assName, extension: saved.extension };
}
