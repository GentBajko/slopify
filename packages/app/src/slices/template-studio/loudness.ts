import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { levelFile } from "../loudness/loudnorm.js";
import {
  encodeHeadroom,
  type LoudnessDefault,
  type LoudnessGoal,
  videoTruePeak,
} from "../loudness/model.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import type { RenderPriority } from "../video/encoding.js";
import { runFfmpeg } from "../video/ffmpeg.js";

// Voice's loudness before and after: Slopify's sample narration as it came, and the same
// levelled to the template's video target, as the run's master would. Phase 3's own voice sample
// takes the bundled narration's place.

// The target a template's video is levelled to, or undefined while Level the volume is off.
export function loudnessGoalOf(
  document: PlayDraftDocument,
  fallback: LoudnessDefault,
): LoudnessGoal | undefined {
  const chosen = document.form.loudness;
  if (!(chosen?.enabled ?? fallback.enabled)) return undefined;
  return {
    lufs: chosen?.videoLufs ?? fallback.videoLufs,
    truePeak: videoTruePeak - encodeHeadroom,
  };
}

export function loudnessHash(goal: LoudnessGoal): string {
  return createHash("sha256")
    .update(JSON.stringify({ version: 2, lufs: goal.lufs, truePeak: goal.truePeak }))
    .digest("hex");
}

// `after` is the levelled master's loudness: what the video's AAC carries. The MP3 played in
// the studio measures about half a LU lower (its encoder cuts the highs the loudness weighting
// counts), so it is never what is reported. `target` and `ceiling` (dBTP) say what it was
// levelled to: a voice whose peaks stand far above its loudness lands under the target, the
// limiter holding the peaks under the ceiling, and the studio says so.
export interface LoudnessReading {
  readonly before: number;
  readonly after: number;
  readonly target: number;
  readonly ceiling: number;
}

export interface LoudnessSamples {
  // The sample narration as it came.
  readonly source: string;
  readonly make: (goal: LoudnessGoal, signal: AbortSignal) => Promise<void>;
  readonly file: (hash: string) => { readonly path: string; readonly bytes: number } | undefined;
  readonly reading: (hash: string) => LoudnessReading | undefined;
}

const readingSchema = z.object({
  before: z.number(),
  after: z.number(),
  target: z.number(),
  ceiling: z.number(),
});
const hashPattern = /^[a-f0-9]{64}$/;

export function createLoudnessSamples(deps: {
  readonly ffmpeg: string;
  readonly dir: string;
  readonly source: string;
  readonly log: Log;
  // Settings → Production defaults → Render priority, read as each sample starts; absent is normal.
  readonly priority?: (() => RenderPriority) | undefined;
}): LoudnessSamples {
  const pathOf = (hash: string, extension: "mp3" | "json"): string =>
    join(deps.dir, `${hash}.${extension}`);
  const file = (hash: string) => {
    if (!hashPattern.test(hash)) return undefined;
    try {
      const stats = statSync(pathOf(hash, "mp3"));
      return stats.isFile() && stats.size > 0
        ? { path: pathOf(hash, "mp3"), bytes: stats.size }
        : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    source: deps.source,
    file,
    reading: (hash) => {
      if (file(hash) === undefined) return undefined;
      try {
        return readingSchema.parse(JSON.parse(readFileSync(pathOf(hash, "json"), "utf8")));
      } catch {
        return undefined;
      }
    },
    make: async (goal, signal) => {
      const hash = loudnessHash(goal);
      if (file(hash) !== undefined) return;
      mkdirSync(deps.dir, { recursive: true, mode: 0o700 });
      const work = join(deps.dir, `${hash}.${randomUUID()}`);
      const priority = deps.priority?.();
      const run = { bin: deps.ffmpeg, log: deps.log, signal, priority };
      try {
        const levelled = await levelFile(run, deps.source, `${work}.wav`, goal, {
          sampleRate: 48_000,
          channels: 1,
        });
        await runFfmpeg({
          bin: deps.ffmpeg,
          args: [
            "-hide_banner",
            "-nostdin",
            "-loglevel",
            "error",
            "-y",
            "-i",
            `${work}.wav`,
            "-c:a",
            "libmp3lame",
            "-b:a",
            "128k",
            "-f",
            "mp3",
            `${work}.mp3`,
          ],
          signal,
          log: deps.log,
          priority,
          onProgress: () => undefined,
        });
        writeFileSync(
          pathOf(hash, "json"),
          JSON.stringify({
            before: Math.round(levelled.before.integrated * 10) / 10,
            after: Math.round(levelled.after.integrated * 10) / 10,
            target: goal.lufs,
            ceiling: goal.truePeak,
          }),
          { mode: 0o600 },
        );
        renameSync(`${work}.mp3`, pathOf(hash, "mp3"));
      } finally {
        rmSync(`${work}.wav`, { force: true });
        rmSync(`${work}.mp3`, { force: true });
      }
    },
  };
}
