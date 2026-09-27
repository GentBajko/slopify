import { execFile } from "node:child_process";
import type { RevisionView } from "../revisions/model.js";
import type { NarrationPeaks } from "./peaks-model.js";

export type { NarrationPeaks };

// The live view's narration waveform: each finished narration piece as a row of peaks, in the
// order it is spoken, growing as pieces land. Once the whole narration is joined (or was
// uploaded) that one file replaces the pieces.

// ceiling: ten bars a second draws a two-minute short in 1200 bars and a two-hour video in
// 72000, which the browser scales down to the width it has.
export const peaksPerSecond = 10;
// The rate the audio is decoded at for peaks only; loudness needs no more than this.
const decodeRate = 4000;
// ceiling: three hours of narration at the decode rate, 16-bit mono.
const decodeMaxBytes = 3 * 3600 * decodeRate * 2;

export interface NarrationAudioPiece {
  readonly key: string;
  readonly assetId: string;
}

// The saved narration audio of a revision, in spoken order: the joined narration when it is
// ready, else each finished request of the intro, the body and the outro.
export function narrationAudio(view: RevisionView): {
  readonly complete: boolean;
  readonly pieces: readonly NarrationAudioPiece[];
} {
  const joined = view.outputs.find(
    (row) =>
      row.selected && row.available && row.state === "ready" && row.output.role === "audio_body",
  );
  if (joined !== undefined)
    return {
      complete: true,
      pieces: [{ key: joined.workKey, assetId: joined.assetId }],
    };
  const order = (key: string): number =>
    key.startsWith("audio:intro") ? 0 : key.startsWith("audio:outro") ? 2 : 1;
  return {
    complete: false,
    pieces: view.pieces
      .filter(
        (row) =>
          row.selected &&
          row.available &&
          row.stageKind === "audio" &&
          row.piece.state === "done" &&
          row.assetId !== null &&
          row.piece.payload !== null &&
          spoken(row.piece.payload),
      )
      .toSorted(
        (left, right) =>
          order(left.key) - order(right.key) ||
          left.key.localeCompare(right.key, "en", { numeric: true }),
      )
      .flatMap((row) => (row.assetId === null ? [] : [{ key: row.key, assetId: row.assetId }])),
  };
}

function spoken(payload: string): boolean {
  try {
    const value: unknown = JSON.parse(payload);
    return typeof value === "object" && value !== null && "segment" in value;
  } catch {
    return false;
  }
}

// The loudest sample of each slice of `perSecond` a second, from 0 to 1.
export function peaksOf(samples: Int16Array, sampleRate: number, perSecond: number): number[] {
  const size = Math.max(1, Math.round(sampleRate / perSecond));
  const peaks: number[] = [];
  for (let at = 0; at < samples.length; at += size) {
    let loudest = 0;
    const end = Math.min(samples.length, at + size);
    for (let index = at; index < end; index++) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > loudest) loudest = value;
    }
    peaks.push(Math.round((loudest / 32768) * 1000) / 1000);
  }
  return peaks;
}

// Decodes an audio file with ffmpeg to mono 16-bit samples and returns its peaks.
export function decodePeaks(
  ffmpeg: string,
  path: string,
  signal: AbortSignal,
): Promise<{ readonly seconds: number; readonly peaks: number[] }> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        path,
        "-ac",
        "1",
        "-ar",
        String(decodeRate),
        "-f",
        "s16le",
        "pipe:1",
      ],
      { encoding: "buffer", maxBuffer: decodeMaxBytes, signal, windowsHide: true },
      (error, stdout) => {
        if (error !== null) {
          reject(new Error(`ffmpeg could not read the narration audio (${error.message}).`));
          return;
        }
        // Copied so the samples start on an even byte, which a pooled Buffer may not.
        const bytes = new Uint8Array(stdout.byteLength - (stdout.byteLength % 2));
        bytes.set(stdout.subarray(0, bytes.byteLength));
        const samples = new Int16Array(bytes.buffer);
        resolve({
          seconds: samples.length / decodeRate,
          peaks: peaksOf(samples, decodeRate, peaksPerSecond),
        });
      },
    );
  });
}
