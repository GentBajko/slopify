import { join } from "node:path";
import type { StageContext } from "../../kernel/runner/index.js";
import { levelLines } from "../loudness/line-level.js";
import type { RevisionView } from "../revisions/model.js";
import type { AudioSegment } from "../video/edit-list.js";
import { linesLevelled } from "./recipe-lines.js";
import type { ExportExecutionDeps } from "./runtime-export.js";
import { readTimingWords } from "./runtime-subtitles.js";

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
  const { words } = readTimingWords(deps, context, view, "evens out the speakers' volume");
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
