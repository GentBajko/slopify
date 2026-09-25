import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Log } from "../../kernel/log.js";
import type { EditList } from "./edit-list.js";
import { clipArgs, concatList, joinArgs, runFfmpeg, slideshowClips } from "./ffmpeg.js";

// The two steps `ffmpeg.ts` explains, run one ffmpeg at a time: the distinct clips into a
// working directory beside the project's files, then the join into the output.
export interface SlideshowRun {
  readonly bin: string;
  // The renderer's only brief: it plays this list and knows nothing of the project.
  readonly edit: EditList;
  readonly output: string;
  readonly burnSubtitles: boolean;
  // Holds subtitles.ass and fonts/ when captions are burned in; the join runs there.
  readonly cwd?: string | undefined;
  // Where the clips' working directory is made. It is removed however the render ends.
  readonly scratch: string;
  readonly signal: AbortSignal;
  readonly onProgress: (elapsedMs: number) => void;
  readonly log: Log;
}

// estimate: a zoompan frame from a 4x still costs several plain encoded frames, and a
// copying join is nearly free, so progress is weighted by that rather than by clock time.
const clipWeight = 4;
const copyWeight = 0.05;

export async function renderSlideshow(run: SlideshowRun): Promise<void> {
  const { edit } = run;
  const { clips, order } = slideshowClips(edit);
  const msOf = (frames: number): number => (frames / edit.fps) * 1000;
  const joinMs = msOf(edit.shots.reduce((sum, shot) => sum + shot.frames, 0));
  // Progress is reported against the video's length, the longer of picture and sound.
  const totalMs = Math.max(
    joinMs,
    edit.audio.reduce((sum, segment) => sum + segment.seconds * 1000, 0),
  );
  const clipMs = clips.reduce((sum, clip) => sum + msOf(clip.shot.frames), 0);
  const work = clipMs * clipWeight + joinMs * (run.burnSubtitles ? 1 : copyWeight);
  const report = (done: number): void => {
    run.onProgress(work > 0 ? Math.round((Math.min(done, work) / work) * totalMs) : 0);
  };
  const workspace = mkdtempSync(join(run.scratch, "render-"));
  try {
    let rendered = 0;
    for (const clip of clips) {
      const before = rendered;
      await runFfmpeg({
        bin: run.bin,
        args: clipArgs(edit, clip.shot, join(workspace, clip.name), run.burnSubtitles),
        signal: run.signal,
        log: run.log,
        onProgress: (elapsedMs) => report(before + elapsedMs * clipWeight),
      });
      rendered += msOf(clip.shot.frames) * clipWeight;
    }
    const list = join(workspace, "slides.ffconcat");
    writeFileSync(list, concatList(order), { mode: 0o600 });
    await runFfmpeg({
      bin: run.bin,
      cwd: run.cwd,
      args: joinArgs(edit, run.output, list, run.burnSubtitles),
      signal: run.signal,
      log: run.log,
      onProgress: (elapsedMs) =>
        report(rendered + elapsedMs * (run.burnSubtitles ? 1 : copyWeight)),
    });
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
