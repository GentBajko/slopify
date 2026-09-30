import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import type { Log } from "../../kernel/log.js";
import { type LoudnessGoal, masterFile, masterReport } from "../loudness/loudnorm.js";
import type { MasterReport } from "../loudness/model.js";
import { cardsAss } from "./cards.js";
import { cacheKey, fileIdentity, keepClip, pruneClips, reuseClip } from "./clip-cache.js";
import type { EditList } from "./edit-list.js";
import {
  audioMixArgs,
  burnPartArgs,
  concatList,
  joinArgs,
  type PortraitOverlay,
  runFfmpeg,
  type SlideshowClip,
  segmentArgs,
  slideshowClips,
} from "./ffmpeg.js";
import { cardsIn } from "./look.js";
import { inPool, renderJobs } from "./pool.js";

// The two steps `ffmpeg.ts` explains: the distinct clips into a working directory beside the
// project's files, several at a time, then the join into the output.
export interface SlideshowRun {
  readonly bin: string;
  // The renderer's only brief: it plays this list and knows nothing of the project.
  readonly edit: EditList;
  readonly output: string;
  readonly burnSubtitles: boolean;
  // Holds subtitles.ass and fonts/ when captions are burned in; the join runs there.
  readonly cwd?: string | undefined;
  // The speaker panel's portraits, beside subtitles.ass; only with burned-in captions.
  readonly portraits?: readonly PortraitOverlay[] | undefined;
  // Where the clips' working directory is made. It is removed however the render ends.
  readonly scratch: string;
  readonly signal: AbortSignal;
  readonly onProgress: (elapsedMs: number) => void;
  readonly log: Log;
  // Level the volume: the target the sound is mastered to (`loudness/model.ts`).
  readonly master?: LoudnessGoal | undefined;
  // The project's clip cache (`clip-cache.ts`); without one every clip is encoded.
  readonly cache?: string | undefined;
  // How many ffmpeg runs go at once; the machine's share when left out (`pool.ts`).
  readonly jobs?: number | undefined;
}

// estimate: a zoompan frame from a 4x still costs several plain encoded frames, and a
// copying join is nearly free, so progress is weighted by that rather than by clock time.
const clipWeight = 4;
const copyWeight = 0.05;

// floor: a burned-in part shorter than a minute is not worth its own run.
const leastPartFrames = 60 * 30;

// The sound the join plays, as the join itself brings every segment to it.
const masterFormat = { sampleRate: 44100, channels: 2 } as const;

// What the master measured, when the run asked for one.
export async function renderSlideshow(run: SlideshowRun): Promise<MasterReport | undefined> {
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
  const jobs = run.jobs ?? renderJobs();
  const parts = run.burnSubtitles ? burnParts(order, clips, jobs) : [];
  const work =
    clipMs * clipWeight +
    joinMs * (run.burnSubtitles ? 1 : copyWeight) +
    (parts.length > 1 ? joinMs * copyWeight : 0);
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
          "Slopify hit an internal error (the chapter cards have no font). Use More → Render the video again in the Video section; if it happens again, use Download diagnostics in Settings and report it.",
        );
      mkdirSync(join(workspace, "fonts"), { mode: 0o700 });
      copyFileSync(font.path, join(workspace, "fonts", `card${extname(font.path)}`));
    }
    // The sound is mixed, levelled and encoded while the picture renders, on its own run; the
    // join then only copies it in. Either failing stops the other, and the first failure is
    // the one reported.
    const stop = new AbortController();
    const follow = (): void => {
      stop.abort();
    };
    if (run.signal.aborted) stop.abort();
    else run.signal.addEventListener("abort", follow, { once: true });
    let failed: { readonly error: unknown } | undefined;
    const watched = <T>(work: Promise<T>): Promise<T> =>
      work.catch((error: unknown) => {
        failed ??= { error };
        stop.abort();
        throw error;
      });
    const sounding =
      edit.audio.length > 0
        ? watched(renderSound(run, edit, workspace, stop.signal))
        : Promise.resolve(undefined);
    // Handled now, since the picture is awaited first and the sound may fail meanwhile.
    sounding.catch((): void => {});
    let rendered = 0;
    const keys = new Set<string>();
    const picture = async (halt: AbortSignal): Promise<string> => {
      // Each run's own progress, summed: runs side by side each report their own elapsed time.
      const running = new Map<string, number>();
      const tell = (): void => {
        report(rendered + [...running.values()].reduce((sum, one) => sum + one, 0));
      };
      await inPool(clips, jobs, halt, async (clip, signal) => {
        const script = clip.name.replace(/\.mp4$/, ".ass");
        const shown = cardsIn(cards, clip.segment.start, clip.segment.count);
        const drawn =
          shown.length > 0 && font !== undefined
            ? cardsAss(edit, shown, font.name, clip.segment.start, edit.cardColor)
            : undefined;
        if (drawn !== undefined) writeFileSync(join(workspace, script), drawn, { mode: 0o600 });
        const output = join(workspace, clip.name);
        const args = segmentArgs(edit, clip.segment, output, run.burnSubtitles, script);
        const weight = msOf(clip.frames) * clipWeight;
        const cache = run.cache;
        let key: string | undefined;
        // The cache only saves time: a clip it cannot name or give back (another project's render
        // let it go a moment ago) is encoded as if there were none.
        try {
          if (cache !== undefined) {
            key = cacheKey(
              run.bin,
              args.map((value) =>
                drawn === undefined ? value : value.replaceAll(script, "\u0000cards"),
              ),
              output,
              drawn === undefined || font === undefined ? [] : [drawn, fileIdentity(font.path)],
            );
            keys.add(key);
            if (reuseClip(cache, key, output)) {
              rendered += weight;
              tell();
              return;
            }
          }
        } catch (error) {
          run.log.write("warn", "video.cache", { detail: messageOf(error) });
          rmSync(output, { force: true });
        }
        await runFfmpeg({
          bin: run.bin,
          ...(cards.length > 0 ? { cwd: workspace } : {}),
          args,
          signal,
          log: run.log,
          onProgress: (elapsedMs) => {
            running.set(clip.name, Math.min(elapsedMs * clipWeight, weight));
            tell();
          },
        });
        running.delete(clip.name);
        rendered += weight;
        if (cache !== undefined && key !== undefined) {
          try {
            keepClip(cache, key, output);
          } catch (error) {
            run.log.write("warn", "video.cache", { detail: messageOf(error) });
          }
        }
      });

      const list = join(workspace, "slides.ffconcat");
      writeFileSync(list, concatList(order), { mode: 0o600 });
      if (parts.length <= 1) return list;
      // A long video's captions are burned in parts side by side, and the parts joined by
      // copying, as the clips are without captions.
      const done = new Map<string, number>();
      const burned = (): void => {
        report(rendered + [...done.values()].reduce((sum, one) => sum + one, 0));
      };
      await inPool(parts, jobs, halt, async (part, signal) => {
        const partList = join(workspace, `${part.name}.ffconcat`);
        writeFileSync(partList, concatList(part.names), { mode: 0o600 });
        await runFfmpeg({
          bin: run.bin,
          cwd: run.cwd,
          args: burnPartArgs(
            edit,
            partList,
            join(workspace, `${part.name}.mp4`),
            part.start,
            run.portraits,
          ),
          signal,
          log: run.log,
          onProgress: (elapsedMs) => {
            done.set(part.name, Math.min(elapsedMs, msOf(part.frames)));
            burned();
          },
        });
        done.set(part.name, msOf(part.frames));
        burned();
      });
      rendered += joinMs;
      const joinedList = join(workspace, "parts.ffconcat");
      writeFileSync(joinedList, concatList(parts.map((part) => `${part.name}.mp4`)), {
        mode: 0o600,
      });
      return joinedList;
    };
    const played = await watched(picture(stop.signal)).catch(() => undefined);
    const sound = await sounding.catch(() => undefined);
    run.signal.removeEventListener("abort", follow);
    if (failed !== undefined) throw failed.error;
    if (played === undefined) throw new Error("the render was canceled");
    const burnsHere = run.burnSubtitles && parts.length <= 1;
    await runFfmpeg({
      bin: run.bin,
      cwd: run.cwd,
      args: joinArgs(edit, run.output, played, burnsHere, run.portraits, sound),
      signal: run.signal,
      log: run.log,
      onProgress: (elapsedMs) => report(rendered + elapsedMs * (burnsHere ? 1 : copyWeight)),
    });
    if (run.cache !== undefined) {
      try {
        pruneClips(run.cache, keys);
      } catch (error) {
        run.log.write("warn", "video.cache", { detail: messageOf(error) });
      }
    }
    // What the finished video measures, after its AAC encode.
    return run.master !== undefined && edit.audio.length > 0
      ? await masterReport(run, run.output, run.master)
      : undefined;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

// The video's finished sound as AAC in the working folder: the narration, silences and bed
// mixed, and with Level the volume mastered first, alone and then as one file.
async function renderSound(
  run: SlideshowRun,
  edit: EditList,
  workspace: string,
  signal: AbortSignal,
): Promise<string> {
  const quiet = { bin: run.bin, signal, log: run.log, onProgress: (): void => {} };
  let played: EditList = edit;
  if (run.master !== undefined) {
    const mixed = join(workspace, "mix.wav");
    await runFfmpeg({ ...quiet, args: audioMixArgs(edit, mixed) });
    const mastered = join(workspace, "master.wav");
    await masterFile({ ...run, signal }, mixed, mastered, run.master, masterFormat);
    played = {
      ...edit,
      audio: [
        {
          kind: "body",
          path: mastered,
          seconds: edit.audio.reduce((sum, segment) => sum + segment.seconds, 0),
        },
      ],
      bed: undefined,
    };
  }
  const sound = join(workspace, "sound.m4a");
  await runFfmpeg({ ...quiet, args: audioMixArgs(played, sound, "aac") });
  return sound;
}

export interface BurnPart {
  // `p1`, `p2`, ...: the part's list and file in the working folder.
  readonly name: string;
  // The clips it plays, in timeline order.
  readonly names: readonly string[];
  // Its first frame on the video's timeline.
  readonly start: number;
  readonly frames: number;
}

// The timeline cut at clip boundaries into at most `jobs` parts of about equal length, a
// minute or more each; one part means the captions are burned in the join as before.
export function burnParts(
  order: readonly string[],
  clips: readonly Pick<SlideshowClip, "name" | "frames">[],
  jobs: number,
): readonly BurnPart[] {
  const framesOf = new Map(clips.map((clip) => [clip.name, clip.frames]));
  const total = order.reduce((sum, name) => sum + (framesOf.get(name) ?? 0), 0);
  const count = Math.max(1, Math.min(jobs, Math.floor(total / leastPartFrames)));
  const parts: BurnPart[] = [];
  let names: string[] = [];
  let start = 0;
  let at = 0;
  for (const name of order) {
    const frames = framesOf.get(name) ?? 0;
    const target = (total * (parts.length + 1)) / count;
    const last = parts.length === count - 1;
    // A part ends at the clip boundary nearest its share of the timeline.
    if (!last && names.length > 0 && at + frames >= target && target - at < at + frames - target) {
      parts.push({ name: `p${String(parts.length + 1)}`, names, start, frames: at - start });
      names = [];
      start = at;
    }
    names.push(name);
    at += frames;
    if (parts.length < count - 1 && at >= (total * (parts.length + 1)) / count) {
      parts.push({ name: `p${String(parts.length + 1)}`, names, start, frames: at - start });
      names = [];
      start = at;
    }
  }
  if (names.length > 0)
    parts.push({ name: `p${String(parts.length + 1)}`, names, start, frames: at - start });
  return parts;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
