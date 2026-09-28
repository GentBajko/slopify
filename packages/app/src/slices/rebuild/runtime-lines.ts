import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { StageContext } from "../../kernel/runner/index.js";
import { levelLines } from "../loudness/line-level.js";
import type { RevisionView } from "../revisions/model.js";
import { outputPath } from "../storage/layout.js";
import type { AudioSegment } from "../video/edit-list.js";
import { linesLevelled } from "./recipe-lines.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { wordsSchema } from "./runtime-subtitles.js";

// The sound a multi-voice run plays, with its body narration levelled line by line
// (`loudness/line-level.ts`) into `directory`, for the video, the audio export and the audio
// files alike. The words are timed on the timeline these segments lay out, so the body starts
// at the seconds of the segments before it. Anything else plays as it was.
export async function lineLevelledAudio(
  deps: ExportExecutionDeps,
  context: StageContext,
  view: RevisionView,
  audio: readonly AudioSegment[],
  directory: string,
): Promise<readonly AudioSegment[]> {
  if (!linesLevelled(view.revision.config)) return audio;
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
      "The narration's word timing, which evens out the speakers' volume, is missing. Use More → Render the video again in the Video section, then Try again.",
    );
  const { words } = wordsSchema.parse(
    JSON.parse(
      readFileSync(outputPath(deps.paths, context.work.projectId, timing.output.path), "utf8"),
    ),
  );
  const run = { bin: deps.ffmpeg, log: deps.log, signal: context.signal };
  const levelled: AudioSegment[] = [];
  let offset = 0;
  for (const segment of audio) {
    if (segment.kind === "body" && segment.path !== null) {
      const target = join(directory, "body-lines.wav");
      const done = await levelLines(run, segment.path, target, words, offset);
      levelled.push(done ? { ...segment, path: target } : segment);
    } else levelled.push(segment);
    offset += segment.seconds;
  }
  return levelled;
}
