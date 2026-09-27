import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Log } from "../../kernel/log.js";
import { cardsAss } from "./cards.js";
import type { EditList } from "./edit-list.js";
import { concatList, joinArgs, runFfmpeg, segmentArgs, slideshowClips } from "./ffmpeg.js";
import { cardsIn } from "./look.js";

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
  const clipMs = clips.reduce((sum, clip) => sum + msOf(clip.frames), 0);
  const work = clipMs * clipWeight + joinMs * (run.burnSubtitles ? 1 : copyWeight);
  const report = (done: number): void => {
    run.onProgress(work > 0 ? Math.round((Math.min(done, work) / work) * totalMs) : 0);
  };
  const workspace = mkdtempSync(join(run.scratch, "render-"));
  try {
    // Chapter cards are drawn by the clips from a script and a font beside them.
    const cards = edit.cards ?? [];
    const font = edit.cardFont;
    if (cards.length > 0) {
      if (font === undefined)
        throw new Error(
          "Slopify hit an internal error (the chapter cards have no font). Use Re-run section on Video; if it happens again, use Download diagnostics in Settings and report it.",
        );
      mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
      copyFileSync(font.path, join(workspace, "fonts", `card${extname(font.path)}`));
    }
    let rendered = 0;
    for (const clip of clips) {
      const before = rendered;
      const script = clip.name.replace(/\.mp4$/, ".ass");
      const shown = cardsIn(cards, clip.segment.start, clip.segment.count);
      if (shown.length > 0 && font !== undefined)
        writeFileSync(
          join(workspace, script),
          cardsAss(edit, shown, font.name, clip.segment.start, edit.cardColor),
          { mode: 0o600 },
        );
      await runFfmpeg({
        bin: run.bin,
        ...(cards.length > 0 ? { cwd: workspace } : {}),
        args: segmentArgs(
          edit,
          clip.segment,
          join(workspace, clip.name),
          run.burnSubtitles,
          script,
        ),
        signal: run.signal,
        log: run.log,
        onProgress: (elapsedMs) => report(before + elapsedMs * clipWeight),
      });
      rendered += msOf(clip.frames) * clipWeight;
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
