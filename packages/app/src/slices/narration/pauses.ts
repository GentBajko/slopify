import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { numberForms } from "../../kernel/ports/number-words.js";
import type { FfmpegRun } from "../loudness/loudnorm.js";
import { measureFile } from "../loudness/loudnorm.js";
import { pieceLufs, pieceTruePeak } from "../loudness/model.js";
import { probeDurationMs, runFfmpeg } from "../video/ffmpeg.js";
import { sentences } from "./chunk.js";
import type { PauseSettings } from "./pauses-model.js";

// Pauses between sentences, made in the join (`pauses-model.ts` says why there). For each
// narration piece:
// 1. its text gives where its sentences end, as a share of how long its words take to say, and
//    which of those ends are paragraph ends;
// 2. ffmpeg's silencedetect gives where the audio is quiet;
// 3. each sentence end is matched, in order, to the quiet stretch nearest where the words say
//    it should be, preferring longer stretches (a comma's breath is shorter than a full stop's);
//    a sentence end with no quiet stretch near it is left alone rather than guessed;
// 4. a matched stretch shorter than the minimum gets silence added in its middle, and the end
//    of a piece gets what the gap to the next piece lacks.
// Nothing is ever removed, so an existing pause is never shortened and no word is cut. The plan
// is made from the piece as spoken and applied to it, or to its levelled copy, which has the
// same timing (`loudness/level-pieces.ts`).

export type BoundaryKind = "sentence" | "paragraph";

export interface TextBoundary {
  // Where the sentence ends, as a share of the text's spoken length (`spokenLength`), 0 to 1.
  readonly ratio: number;
  readonly kind: BoundaryKind;
}

export interface Silence {
  readonly start: number;
  readonly end: number;
}

export interface PiecePauses {
  // Silence added inside the piece: at `at` seconds of the piece as spoken, `seconds` long.
  readonly inserts: readonly { readonly at: number; readonly seconds: number }[];
  // The quiet the piece starts and ends with, in seconds.
  readonly leading: number;
  readonly trailing: number;
}

// How long a stretch of text takes to say, in letters. Digits count as their words ("1982" as
// "nineteen eighty two", English's being a fair measure for any language's), an IPA spelling's
// slashes and stress marks count nothing, and a run of spacing counts one. Counted as written,
// a paragraph full of years and issue numbers put its end seconds early.
export function spokenLength(text: string): number {
  return Array.from(
    text
      .replace(/\d[\d,]*(?:\.\d+)?(?:s|st|nd|rd|th)?\b/gi, (raw) => numberForms(raw)[0] ?? raw)
      .replace(/[/ˈˌː]/g, "")
      .replace(/\s+/g, " "),
  ).length;
}

// The sentence ends inside a text, not counting its last. A name's initial ("Mary J. Blake")
// ends no sentence, whatever the sentence splitter makes of its full stop.
export function textBoundaries(text: string): readonly TextBoundary[] {
  const parts = [...sentences(text)];
  const total = parts.reduce((sum, part) => sum + spokenLength(part), 0);
  if (parts.length < 2 || total === 0) return [];
  const boundaries: TextBoundary[] = [];
  let offset = 0;
  for (const part of parts.slice(0, -1)) {
    offset += spokenLength(part);
    const trailing = /\s*$/.exec(part)?.[0] ?? "";
    // Only a real sentence: text that is only spacing is no sentence of its own.
    if (part.trim() === "") continue;
    if (/(?:^|[\s("'])\p{Lu}\.\s*$/u.test(part)) continue;
    boundaries.push({
      ratio: offset / total,
      kind: /\n[ \t\r]*\n/.test(trailing) || /\n/.test(trailing) ? "paragraph" : "sentence",
    });
  }
  return boundaries;
}

// silencedetect prints `silence_start: 1.23` and `silence_end: 1.56 | silence_duration: 0.33`.
// A stretch still open at the end runs to the end of the piece.
export function parseSilences(stderr: string, durationSeconds: number): readonly Silence[] {
  const silences: Silence[] = [];
  let open: number | undefined;
  for (const match of stderr.matchAll(/silence_(start|end):\s*(-?[0-9.]+)/g)) {
    const value = Math.max(0, Number(match[2]));
    if (!Number.isFinite(value)) continue;
    if (match[1] === "start") open = value;
    else if (open !== undefined) {
      silences.push({ start: open, end: Math.min(durationSeconds, value) });
      open = undefined;
    }
  }
  if (open !== undefined && open < durationSeconds)
    silences.push({ start: open, end: durationSeconds });
  return silences;
}

// ceiling: a sentence end more than two seconds (or a fifth of the piece) from where its words
// put it is not trusted to be that sentence's pause.
const windowSeconds = 2;
const windowShare = 0.2;
// ceiling: a second of quiet counts for three seconds of distance, so a full stop's pause wins
// over a comma's breath a little nearer to where the words put the end.
const durationWeight = 3;
// A stretch this near either end of the piece is the piece's own lead-in or tail.
const edgeSeconds = 0.02;
// ceiling: a stretch shorter than this share of the voice's usual sentence pause (the median of
// its as many longest stretches as the piece has sentence ends) is a breath between words, and
// never a sentence end. The words only say roughly where an end is: a voice's pace swings with
// its delivery cues, and one narration put a paragraph end 17 seconds after where its words
// did. Lengthening a breath there cut "sixty-two" in two.
const breathShare = 0.4;

export function planPauses(input: {
  readonly durationSeconds: number;
  readonly silences: readonly Silence[];
  readonly boundaries: readonly TextBoundary[];
  readonly settings: PauseSettings;
}): PiecePauses {
  const { durationSeconds, silences, boundaries, settings } = input;
  const leadingSilence = silences.find((one) => one.start <= edgeSeconds);
  const trailingSilence = silences.find((one) => one.end >= durationSeconds - edgeSeconds);
  const leading = leadingSilence === undefined ? 0 : leadingSilence.end;
  const trailing =
    trailingSilence === undefined || trailingSilence === leadingSilence
      ? 0
      : durationSeconds - trailingSilence.start;
  const speechStart = leading;
  const speechEnd = Math.max(speechStart, durationSeconds - trailing);
  const speech = speechEnd - speechStart;
  const between = silences.filter((one) => one !== leadingSilence && one !== trailingSilence);
  const longest = between
    .map((one) => one.end - one.start)
    .sort((a, b) => b - a)
    .slice(0, boundaries.length);
  const usual = longest[Math.floor((longest.length - 1) / 2)] ?? 0;
  const inner = between.filter((one) => one.end - one.start >= usual * breathShare);
  if (speech <= 0 || inner.length === 0 || boundaries.length === 0)
    return { inserts: [], leading, trailing };
  const window = Math.max(windowSeconds, speech * windowShare);
  const expected = boundaries.map((one) => speechStart + one.ratio * speech);
  // The best in-order matching: every sentence end takes a later stretch than the one before,
  // or none. Cost is the distance from where the words put the end, less the stretch's length
  // weighted (a full stop's pause is longer than a comma's); leaving an end unmatched costs the
  // window.
  const m = boundaries.length;
  const n = inner.length;
  const cost: number[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => Number.POSITIVE_INFINITY),
  );
  const choice: ("skip-end" | "skip-silence" | "match")[][] = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => "skip-end" as const),
  );
  for (let j = 0; j <= n; j += 1) {
    const row = cost[0];
    if (row !== undefined) row[j] = 0;
  }
  for (let i = 1; i <= m; i += 1) {
    const row = cost[i] as number[];
    const previous = cost[i - 1] as number[];
    const picks = choice[i] as ("skip-end" | "skip-silence" | "match")[];
    row[0] = (previous[0] ?? 0) + window;
    picks[0] = "skip-end";
    for (let j = 1; j <= n; j += 1) {
      const silence = inner[j - 1] as Silence;
      const middle = (silence.start + silence.end) / 2;
      const distance = Math.abs(middle - (expected[i - 1] ?? 0));
      const options: [number, "skip-end" | "skip-silence" | "match"][] = [
        [(previous[j] ?? 0) + window, "skip-end"],
        [row[j - 1] ?? Number.POSITIVE_INFINITY, "skip-silence"],
      ];
      if (distance <= window)
        options.push([
          (previous[j - 1] ?? 0) + distance - durationWeight * (silence.end - silence.start),
          "match",
        ]);
      const best = options.reduce((low, one) => (one[0] < low[0] ? one : low));
      row[j] = best[0];
      picks[j] = best[1];
    }
  }
  const matched: { boundary: TextBoundary; silence: Silence }[] = [];
  let i = m;
  let j = n;
  while (i > 0) {
    const pick = choice[i]?.[j] ?? "skip-end";
    if (j > 0 && pick === "match") {
      matched.push({
        boundary: boundaries[i - 1] as TextBoundary,
        silence: inner[j - 1] as Silence,
      });
      i -= 1;
      j -= 1;
    } else if (j > 0 && pick === "skip-silence") j -= 1;
    else i -= 1;
  }
  const inserts = matched.reverse().flatMap(({ boundary, silence }) => {
    const wanted = minimumFor(boundary.kind, settings);
    const have = silence.end - silence.start;
    return wanted > have
      ? [{ at: round((silence.start + silence.end) / 2), seconds: round(wanted - have) }]
      : [];
  });
  return { inserts, leading, trailing };
}

export function minimumFor(kind: BoundaryKind, settings: PauseSettings): number {
  return kind === "paragraph"
    ? Math.max(settings.sentenceSeconds, settings.paragraphSeconds)
    : settings.sentenceSeconds;
}

// The piece with its silences added and `padEnd` seconds of silence after it, as 16-bit PCM
// WAV. Every stretch between two inserts is cut out of the piece as it is and played in order.
export function insertArgs(
  input: string,
  output: string,
  inserts: PiecePauses["inserts"],
  padEnd: number,
  format: { readonly sampleRate: number; readonly channels: number },
): string[] {
  const layout = format.channels === 1 ? "mono" : "stereo";
  const base = `aformat=sample_fmts=fltp:sample_rates=${String(format.sampleRate)}:channel_layouts=${layout}`;
  const chains: string[] = [
    `[0:a]${base},asplit=${String(inserts.length + 1)}${inserts.map((_one, at) => `[s${String(at)}]`).join("")}[s${String(inserts.length)}]`,
  ];
  const cuts = [0, ...inserts.map((one) => one.at)];
  cuts.forEach((from, at) => {
    const to = inserts[at]?.at;
    const trim = `atrim=start=${from.toFixed(6)}${to === undefined ? "" : `:end=${to.toFixed(6)}`},asetpts=PTS-STARTPTS`;
    const before = at === 0 ? undefined : inserts[at - 1]?.seconds;
    const delay = before === undefined ? "" : `,adelay=delays=${Math.round(before * 1000)}:all=1`;
    const pad = to === undefined && padEnd > 0 ? `,apad=pad_dur=${padEnd.toFixed(3)}` : "";
    chains.push(`[s${String(at)}]${trim}${delay}${pad}[p${String(at)}]`);
  });
  chains.push(
    `${cuts.map((_one, at) => `[p${String(at)}]`).join("")}concat=n=${String(cuts.length)}:v=0:a=1[a]`,
  );
  return [
    "-hide_banner",
    "-nostdin",
    "-loglevel",
    "error",
    "-nostats",
    "-y",
    "-i",
    input,
    "-filter_complex",
    chains.join(";"),
    "-map",
    "[a]",
    "-c:a",
    "pcm_s16le",
    "-f",
    "wav",
    output,
  ];
}

// ceiling: quiet is 22 dB under the piece's own loudness (never above -35 dBFS), held for at
// least 60 ms: under a sentence's breath, over a room's hiss.
const quietBelow = 22;
const quietFloor = -35;
const quietSeconds = 0.06;

// Where a piece is quiet, measured on the piece as spoken.
export async function measurePiece(
  run: FfmpegRun,
  file: string,
): Promise<{ readonly durationSeconds: number; readonly silences: readonly Silence[] }> {
  const durationSeconds = (await probeDurationMs(run.bin, file, run.signal, run.log)) / 1000;
  const loudness = await measureFile(run, file, { lufs: pieceLufs, truePeak: pieceTruePeak });
  const noise = Number.isFinite(loudness.integrated)
    ? Math.min(quietFloor, loudness.integrated - quietBelow)
    : quietFloor;
  let stderr = "";
  await runFfmpeg({
    bin: run.bin,
    args: [
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "info",
      "-nostats",
      "-i",
      file,
      "-af",
      `silencedetect=noise=${noise.toFixed(1)}dB:d=${String(quietSeconds)}`,
      "-f",
      "null",
      "-",
    ],
    signal: run.signal,
    log: run.log,
    onProgress: (): void => {},
    onStderr: (text) => {
      stderr += text;
    },
  });
  return { durationSeconds, silences: parseSilences(stderr, durationSeconds) };
}

export interface PausedPiece {
  // The spoken piece this plan was made from.
  readonly file: string;
  readonly text: string;
  // What follows the piece: nothing (the last), the next piece across a sentence or paragraph
  // end, or a turn gap that the pause minimum leaves alone.
  readonly next: "end" | "turn" | BoundaryKind;
}

// Every piece's plan, from the pieces as spoken: silences inside, and at each piece's end what
// the gap to the next piece lacks.
export async function planPieces(
  run: FfmpegRun,
  pieces: readonly PausedPiece[],
  settings: PauseSettings,
): Promise<readonly { readonly pauses: PiecePauses; readonly padEnd: number }[]> {
  const measured: PiecePauses[] = [];
  for (const piece of pieces) {
    run.signal.throwIfAborted();
    const { durationSeconds, silences } = await measurePiece(run, piece.file);
    measured.push(
      planPauses({
        durationSeconds,
        silences,
        boundaries: textBoundaries(piece.text),
        settings,
      }),
    );
  }
  return measured.map((pauses, at) => {
    const piece = pieces[at] as PausedPiece;
    const following = measured[at + 1];
    if (piece.next === "end" || piece.next === "turn" || following === undefined)
      return { pauses, padEnd: 0 };
    const gap = pauses.trailing + following.leading;
    return { pauses, padEnd: round(Math.max(0, minimumFor(piece.next, settings) - gap)) };
  });
}

// The pieces written again with their pauses, as WAVs in `directory`, in the order given.
// `files` are what is joined (the spoken pieces, or their levelled copies); `plans` are from
// the spoken pieces.
export async function applyPauses(
  run: FfmpegRun,
  files: readonly string[],
  plans: readonly { readonly pauses: PiecePauses; readonly padEnd: number }[],
  directory: string,
): Promise<{ readonly files: readonly string[]; readonly added: number }> {
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const written: string[] = [];
  let added = 0;
  for (const [index, file] of files.entries()) {
    run.signal.throwIfAborted();
    const plan = plans[index];
    const output = join(directory, `paced-${String(index + 1).padStart(4, "0")}.wav`);
    await runFfmpeg({
      bin: run.bin,
      args: insertArgs(file, output, plan?.pauses.inserts ?? [], plan?.padEnd ?? 0, {
        sampleRate: 44100,
        channels: 1,
      }),
      signal: run.signal,
      log: run.log,
      onProgress: (): void => {},
    });
    added += (plan?.pauses.inserts.length ?? 0) + ((plan?.padEnd ?? 0) > 0 ? 1 : 0);
    written.push(output);
  }
  return { files: written, added };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
