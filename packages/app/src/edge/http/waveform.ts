import type { Context } from "hono";
import type { DecodePeaks } from "./narration-peaks.js";
import { problem, titleOf } from "./problem.js";

// The audio player's waveform: `?waveform=N` on a file's own URL answers the file's loudness
// as N bars from 0 to 1, instead of the file. The peaks come from the same ffmpeg decode as the
// live view's waveform (`slices/narration/peaks.ts`), ten a second, folded to N.

// ceiling: bars a player asks for; its track is a few hundred pixels at the widest.
export const waveformBarsMax = 2000;
// ceiling: files whose peaks stay in memory. A file keeps its path and size until it is
// replaced, so a cached row is keyed by both; the oldest goes first.
const cachedFiles = 100;

export interface Waveform {
  readonly seconds: number;
  readonly peaks: readonly number[];
}

// The average of each of `bars` equal runs of `peaks`; fewer peaks than bars are kept as they
// are. The average, not the loudest: a long narration's every run has a loud word in it, so
// the loudest made every bar full height, and the average shows where it is quiet.
export function foldPeaks(peaks: readonly number[], bars: number): readonly number[] {
  if (peaks.length <= bars) return peaks;
  const step = peaks.length / bars;
  return Array.from({ length: bars }, (_value, bar) => {
    const from = Math.floor(bar * step);
    const end = Math.max(from + 1, Math.min(peaks.length, Math.floor((bar + 1) * step)));
    let sum = 0;
    for (let at = from; at < end; at++) sum += peaks[at] ?? 0;
    return Math.round((sum / (end - from)) * 1000) / 1000;
  });
}

// The answer to a file request asking for its waveform, or undefined when it does not ask.
export function waveformAnswer(decode: DecodePeaks | undefined) {
  const cache = new Map<string, Waveform>();
  return async (
    c: Context,
    file: { readonly path: string; readonly bytes: number; readonly contentType: string },
  ): Promise<Response | undefined> => {
    const raw = c.req.query("waveform");
    if (raw === undefined) return undefined;
    const bars = Number(raw);
    if (!Number.isInteger(bars) || bars < 1 || bars > waveformBarsMax)
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: `Ask for a waveform of 1 to ${String(waveformBarsMax)} bars.`,
      });
    if (!file.contentType.startsWith("audio/"))
      return problem(c, {
        status: 400,
        title: titleOf(400),
        detail: "Only an audio file has a waveform. This file plays without one.",
      });
    if (decode === undefined)
      return problem(c, {
        status: 503,
        title: titleOf(503),
        detail:
          "Slopify can't draw the waveform because ffmpeg isn't available. The audio still plays. Restart Slopify; if it keeps happening, use Download diagnostics in Settings and report it.",
      });
    const key = `${file.path}\0${String(file.bytes)}`;
    let waveform = cache.get(key);
    if (waveform === undefined) {
      try {
        waveform = await decode(file.path, c.req.raw.signal);
      } catch (error) {
        return problem(c, {
          status: 500,
          title: titleOf(500),
          detail: `Slopify couldn't read this audio to draw its waveform (${error instanceof Error ? error.message : String(error)}). The audio still plays.`,
        });
      }
      cache.set(key, waveform);
      while (cache.size > cachedFiles) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
    }
    return c.json({
      seconds: waveform.seconds,
      peaks: foldPeaks(waveform.peaks, bars),
    } satisfies Waveform);
  };
}
