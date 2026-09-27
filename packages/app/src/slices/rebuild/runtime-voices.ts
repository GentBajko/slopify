import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { StageContext } from "../../kernel/runner/index.js";
import type { StageRunResult } from "../../kernel/runner/work.js";
import type { PreparedOutput } from "../revisions/publication-model.js";
import { allocateAsset, discardPreparedAssets, sealAsset } from "../storage/assets.js";
import { outputPath, projectDir } from "../storage/layout.js";
import { runFfmpeg } from "../video/ffmpeg.js";
import { audioChapters, audioFileArgs, ffmetadata } from "../voices/audio-files.js";
import { turnStarts } from "../voices/timing.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { exportSnapshot, revisionAudio } from "./runtime-export-inputs.js";
import { preparedResult, publishResult } from "./runtime-publication.js";
import { wordsSchema } from "./runtime-subtitles.js";
import type { WorkPiece } from "./work-records.js";

// The listening files of a multi-voice run: the MP3 and the M4B of the narration timeline,
// with a chapter at each section of the script where its first turn is heard.
export async function executeVoicesRecipe(
  deps: ExportExecutionDeps,
  context: StageContext,
  piece: WorkPiece,
): Promise<StageRunResult> {
  if (
    deps.db
      .prepare("SELECT state FROM revision_work_pieces WHERE id=? AND work_id=?")
      .get(piece.id, context.work.workId)?.state === "done"
  )
    return "done";
  if (!context.maySubmit(piece.id)) return "held";
  if (piece.key !== "voices:files" || piece.input.kind !== "local")
    throw new Error(
      "Slopify hit an internal error (unknown kind of listening-file step). Retry stage; if it happens again, use Download diagnostics in Settings and report it.",
    );
  context.signal.throwIfAborted();
  const { view } = exportSnapshot(deps, context, piece);
  const sections = z
    .tuple([z.unknown(), z.unknown(), z.array(z.tuple([z.string(), z.number()])), z.string()])
    .parse(piece.input.values)[2]
    .map(([title, firstTurn]) => ({ title, firstTurn }));
  const timing = view.outputs.find(
    (row) =>
      row.selected &&
      row.available &&
      row.state === "ready" &&
      row.workKey === "subtitles:timing" &&
      row.output.role === "subtitle_words",
  );
  if (timing === undefined)
    throw new Error(
      "The narration's word timing, which the chapter markers come from, is missing. Use Re-run section on Video, then Retry stage.",
    );
  const { words } = wordsSchema.parse(
    JSON.parse(
      readFileSync(outputPath(deps.paths, context.work.projectId, timing.output.path), "utf8"),
    ),
  );
  const audio = await revisionAudio(deps, context, view);
  if (audio.length === 0)
    throw new Error(
      "The MP3 and M4B files need narration audio, but this project has none. Turn narration on in Edit project, or turn Audio files off under Speakers (Play → Audio, or Edit project → Providers), then Retry stage.",
    );
  const totalSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
  const chapters = audioChapters({
    title: view.revision.config.title,
    sections,
    turnStarts: turnStarts(words),
    totalSeconds,
  });
  const directory = mkdtempSync(join(projectDir(deps.paths, context.work.projectId), "audio-"));
  const pending = [
    allocateAsset(deps, context.work.projectId, "narration.mp3"),
    allocateAsset(deps, context.work.projectId, "audiobook.m4b"),
  ] as const;
  const prepared: PreparedOutput[] = [];
  try {
    const metadata = join(directory, "chapters.txt");
    writeFileSync(metadata, ffmetadata(view.revision.config.title, chapters), { mode: 0o600 });
    for (const [at, kind] of (["mp3", "m4b"] as const).entries()) {
      const target = pending[at];
      if (target === undefined) continue;
      await runFfmpeg({
        bin: deps.ffmpeg,
        args: audioFileArgs(audio, metadata, target.absolutePath, kind),
        signal: context.signal,
        log: deps.log,
        onProgress: (): void => {},
      });
      context.signal.throwIfAborted();
      prepared.push(
        preparedResult(
          deps,
          context,
          piece,
          kind === "mp3" ? "audio_mp3" : "audio_m4b",
          sealAsset(deps, target),
          Math.round(totalSeconds * 1000),
        ),
      );
    }
    await publishResult(deps, context, piece, prepared, { chapters });
    return "done";
  } finally {
    discardPreparedAssets(deps, [...pending, ...prepared.map((one) => one.asset)]);
    rmSync(directory, { recursive: true, force: true });
  }
}
