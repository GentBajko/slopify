import { readFileSync } from "node:fs";
import { z } from "zod";
import { subtitleModelDir } from "../../kernel/paths.js";
import type { SubtitleOmission, TimedWord } from "../../kernel/ports/subtitles.js";
import { SubtitleMismatch } from "../../kernel/ports/subtitles.js";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import { resolveFont } from "../fonts/index.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { validateCues } from "../revisions/rules.js";
import { discardPreparedAssets, writeAsset } from "../storage/assets.js";
import { outputPath } from "../storage/layout.js";
import { captionCues, serializeAss, serializeSrt, serializeVtt } from "../subtitles/captions.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import {
  type ExportSnapshot,
  exportSnapshot,
  retainedOutput,
  revisionAudio,
  revisionTranscript,
} from "./runtime-export-inputs.js";
import {
  type NarrationChunk,
  narrationChunks,
  narrationTextParts,
} from "./runtime-narration-text.js";
import { preparedResult, preparedText, publishResult } from "./runtime-publication.js";
import type { WorkPiece } from "./work-records.js";

const wordsSchema = z.object({
  key: z.string(),
  words: z.array(
    z.object({
      text: z.string(),
      start: z.number().finite().nonnegative(),
      end: z.number().finite().positive(),
      confidence: z.number().optional(),
    }),
  ),
  omissions: z
    .array(z.object({ start: z.number().finite().nonnegative(), text: z.string() }))
    .default([]),
});
const cuesSchema = z.object({
  cues: z.array(
    z.object({
      text: z.string(),
      start: z.number().finite().nonnegative(),
      end: z.number().finite().positive(),
    }),
  ),
  omissions: wordsSchema.shape.omissions,
});

export async function executeSubtitleRecipe(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (!context.maySubmit(piece.id)) return "held";
  context.signal.throwIfAborted();
  const snapshot = exportSnapshot(deps, context, piece);
  if (piece.key === "subtitles:timing") return timing(deps, context, piece, snapshot);
  if (piece.key === "subtitles:cues") return cues(deps, context, piece, snapshot);
  if (piece.key === "subtitles:files") return files(deps, context, piece, snapshot);
  throw new Error("Unknown subtitle recipe.");
}
async function timing(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
): Promise<StageRunResult> {
  const audio = await revisionAudio(deps, context, snapshot.view);
  if (audio.length === 0) throw new Error("Subtitles need narration audio.");
  const alignSubtitles = deps.alignSubtitles;
  if (alignSubtitles === undefined)
    throw new Error("Local subtitle alignment is unavailable in this build.");
  if (!context.maySubmit(piece.id)) return "held";
  const words: TimedWord[] = [];
  const omissions: SubtitleOmission[] = [];
  let offset = 0;
  const total = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  for (const segment of audio) {
    context.signal.throwIfAborted();
    const { path, kind } = segment;
    if (path !== null && kind !== "gap") {
      const aligned = await located(snapshot, kind, () =>
        alignSubtitles({
          audioPath: path,
          text: revisionTranscript(deps, snapshot, kind),
          cacheDir: subtitleModelDir(deps.paths.dataDir),
          ffmpeg: deps.ffmpeg,
          signal: context.signal,
          onOmission: (value) => omissions.push({ ...value, start: value.start + offset }),
          onProgress: (current, maximum) =>
            context.emit({
              type: "stage.progress",
              projectId: context.work.projectId,
              stage: "video",
              current: Math.round(
                (100 * (offset + segment.seconds * (maximum > 0 ? current / maximum : 0))) / total,
              ),
              total: 100,
            }),
        }),
      );
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
  if (captionCues(words).length === 0)
    throw new Error(
      "No spoken words could be aligned. Check that the English article matches the audio.",
    );
  context.signal.throwIfAborted();
  const output = preparedText(
    deps,
    context,
    piece,
    "subtitle_words",
    "subtitles.json",
    JSON.stringify({ key: piece.logicalFingerprint ?? piece.fingerprint, words, omissions }),
  );
  await publishResult(deps, context, piece, [output], { words, omissions }, output.asset);
  return "done";
}
async function cues(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
): Promise<StageRunResult> {
  const { view, plan } = snapshot;
  const manual = view.revision.content.subtitleCues;
  let value: z.infer<typeof cuesSchema>;
  if (manual !== undefined) {
    if (plan.work.find((one) => one.key === piece.key)?.disposition === "review")
      throw new Error("Review the saved captions against the current narration before rebuilding.");
    const audio = await revisionAudio(deps, context, view);
    const errors = validateCues(
      manual.cues,
      audio.reduce((sum, segment) => sum + segment.seconds, 0),
    );
    if (errors.length > 0) throw new Error(errors.map((error) => error.message).join(" "));
    value = { cues: [...manual.cues], omissions: [] };
  } else {
    const output = view.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        one.workKey === "subtitles:timing",
    );
    if (output === undefined) throw new Error("The revision has no aligned subtitle timing.");
    const timed = wordsSchema.parse(
      JSON.parse(
        readFileSync(outputPath(deps.paths, context.work.projectId, output.output.path), "utf8"),
      ),
    );
    value = { cues: [...captionCues(timed.words)], omissions: timed.omissions };
  }
  if (!context.maySubmit(piece.id)) return "held";
  const asset = writeAsset(
    deps,
    context.work.projectId,
    "cues.json",
    Buffer.from(JSON.stringify(value)),
  );
  await publishResult(deps, context, piece, [], value, asset);
  return "done";
}
async function files(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
  snapshot: ExportSnapshot,
): Promise<StageRunResult> {
  const { view } = snapshot;
  const config = view.revision.config.subtitles;
  if (config === undefined || config.mode === "off")
    throw new Error("The admitted revision has no subtitles.");
  const row = view.pieces.find(
    (one) =>
      one.key === "subtitles:cues" && one.selected && one.available && one.piece.state === "done",
  );
  if (row?.piece.payload === null || row?.piece.payload === undefined)
    throw new Error("The revision has no prepared captions.");
  const value = cuesSchema.parse(JSON.parse(row.piece.payload));
  const previous = view.outputs.find(
    (one) => one.output.role === "subtitle_font" && one.selected && one.available,
  );
  const previousFiles = view.pieces.find(
    (one) =>
      one.key === "subtitles:files" &&
      one.piece.state === "done" &&
      (one.selected ||
        (one.publicationId !== null && one.publicationId === previous?.publicationId)),
  );
  const savedFont = z
    .object({
      font: z
        .object({
          id: z.string(),
          name: z.string(),
          assName: z.string(),
          extension: z.enum([".ttf", ".otf", ".ttc"]),
        })
        .optional(),
    })
    .parse(JSON.parse(previousFiles?.piece.payload ?? "{}")).font;
  const font =
    savedFont?.id === config.fontId && previous !== undefined
      ? { ...savedFont, path: outputPath(deps.paths, context.work.projectId, previous.output.path) }
      : await resolveFont(deps.paths, config.fontId);
  if (!context.maySubmit(piece.id)) return "held";
  const prepared: PreparedOutput[] = [];
  try {
    const frame =
      view.revision.config.format === "16:9"
        ? { width: 1920, height: 1080 }
        : { width: 1080, height: 1920 };
    for (const [role, filename, text] of [
      ["subtitles_srt", "subtitles.srt", serializeSrt(value.cues)],
      ["subtitles_vtt", "subtitles.vtt", serializeVtt(value.cues)],
      [
        "subtitle_ass",
        "subtitles.ass",
        serializeAss(value.cues, {
          ...frame,
          fontName: font.assName,
          fontSize: config.fontSize,
          position: config.position,
        }),
      ],
    ] as const)
      prepared.push(preparedText(deps, context, piece, role, filename, text));
    prepared.push(
      preparedResult(
        deps,
        context,
        piece,
        "subtitle_font",
        writeAsset(
          deps,
          context.work.projectId,
          `selected${font.extension}`,
          readFileSync(font.path),
        ),
      ),
    );
    const media = view.outputs.find(
      (one) =>
        one.selected &&
        one.available &&
        one.state === "ready" &&
        (one.output.role === "audio_export" ||
          (one.output.role === "video" && config.mode === "files")),
    );
    if (media !== undefined) {
      const retained = retainedOutput(deps, view, media);
      prepared.push({
        ...retained,
        output: {
          ...retained.output,
          meta: {
            ...retained.output.meta,
            subtitlesMode: "files",
            subtitleOmissions: value.omissions,
          },
        },
      });
    }
    await publishResult(deps, context, piece, prepared, {
      ...value,
      font: { id: font.id, name: font.name, assName: font.assName, extension: font.extension },
    });
    return "done";
  } finally {
    discardPreparedAssets(
      deps,
      prepared.map((one) => one.asset),
    );
  }
}

// A mismatch names the place to fix: the time in the narration, the chunk that holds it (as
// the Narration editor numbers them) and what was expected against what was heard. The
// usual cause is a TTS request that skipped or reworded a sentence.
async function located<T>(
  snapshot: ExportSnapshot,
  segment: "intro" | "body" | "outro",
  align: () => Promise<T>,
): Promise<T> {
  try {
    return await align();
  } catch (error) {
    if (!(error instanceof SubtitleMismatch)) throw error;
    throw new Error(mismatchMessage(snapshot, segment, error), { cause: error });
  }
}

export function mismatchMessage(
  snapshot: Pick<ExportSnapshot, "view" | "plan">,
  segment: "intro" | "body" | "outro",
  mismatch: SubtitleMismatch,
): string {
  let chunks: readonly NarrationChunk[] = [];
  try {
    chunks = narrationChunks(narrationTextParts(snapshot.view, snapshot.plan, segment));
  } catch {
    // Without a readable plan the message still gives the time and the words.
  }
  return describeMismatch(chunks, segment, mismatch);
}

export function describeMismatch(
  chunks: readonly NarrationChunk[],
  segment: "intro" | "body" | "outro",
  mismatch: Pick<SubtitleMismatch, "at" | "expected" | "heard">,
): string {
  const probe = comparable(mismatch.expected).split(" ").slice(0, 6).join(" ");
  const at =
    probe === ""
      ? chunks.length - 1
      : chunks.findIndex((chunk) => comparable(chunk.spokenText).includes(probe));
  const chunk = at === -1 ? undefined : chunks[at];
  const where =
    chunk === undefined
      ? `${clock(mismatch.at)} into the ${segment} narration`
      : `${clock(mismatch.at)} into the ${segment} narration, in narration chunk ${String(at + 1)} of ${String(chunks.length)} (it starts "${opening(chunk.spokenText)}")`;
  const expected = mismatch.expected === "" ? "the end of the text" : `"${mismatch.expected}…"`;
  const heard = mismatch.heard === "" ? "no more speech" : `"${mismatch.heard.toLowerCase()}…"`;
  const fix =
    chunk === undefined
      ? "Check that part of the narration, regenerate it in Edit project → Narration, then Resume."
      : `In Edit project → Narration, regenerate narration chunk ${String(at + 1)}, then Resume.`;
  return `Subtitles stopped matching the audio at ${where}. The text expected ${expected} but the audio has ${heard} The recording there probably skips or changes words. ${fix}`;
}

function comparable(text: string): string {
  return text
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function opening(text: string): string {
  return text.trim().split(/\s+/).slice(0, 6).join(" ");
}

function clock(seconds: number): string {
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${String(minutes)}:${rest}`;
}
