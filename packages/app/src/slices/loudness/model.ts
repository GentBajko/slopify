// Loudness normalization ("Level the volume"). Text-to-speech comes back at a different
// loudness per voice and even per request, so a joined narration jumps. With the setting on:
// - every narration piece (a chunk, an intro or outro part, a speaker's turn) is measured and
//   brought to one common loudness before the pieces are joined (`loudnorm.ts`), in a step of
//   its own beside the plain join (`recipe-audio.ts`), so the word timing, which reads the
//   plain join, and everything written from it are never made again for a volume change;
// - every finished file is mastered to a target: the long video and the shorts to the video
//   target, the audio files (the audio-only WAV, an audiobook's MP3 and M4B) to their own.
// The ambient bed and the shorts' music are mixed before the master and ducked by the levelled
// voice, so they keep their place under it.
//
// Browser-safe: Play, Edit project and Settings convert the same numbers.
//
// A run without the setting has no `loudness` at all, which is what every project saved before
// it was, and every recipe leaves it out of its fingerprint then.

export interface LoudnessSettings {
  // The long video's and the shorts' integrated loudness, in LUFS.
  readonly videoLufs: number;
  // The audio files' integrated loudness, in LUFS.
  readonly audioFilesLufs: number;
}

// The app-wide default (Settings → General), which Play starts a new run from.
export interface LoudnessDefault extends LoudnessSettings {
  readonly enabled: boolean;
}

// YouTube and Spotify play everything back at about -14 LUFS, so a video mastered there is
// neither turned down nor left quiet. Audiobook shops ask for about -18 to -20 LUFS with more
// headroom, so the listening files sit lower.
export const recommendedVideoLufs = -14;
export const recommendedAudioFilesLufs = -18;
export const defaultLoudness: LoudnessDefault = {
  enabled: true,
  videoLufs: recommendedVideoLufs,
  audioFilesLufs: recommendedAudioFilesLufs,
};

// The peak ceilings, in dBTP (true peak, between the samples). The video's leaves room for the
// lossy AAC encode; the audio files' is what audiobook shops ask for.
export const videoTruePeak = -1.5;
export const audioFilesTruePeak = -3;

// The master aims this far under the ceiling: a lossy encode (the video's AAC, the MP3 and
// M4B) lifts the peaks by about half a dB at the bitrates Slopify writes, and what is measured
// is the finished file.
export const encodeHeadroom = 0.5;

// The common level every narration piece is brought to before the join. Fixed, so changing the
// Volume only masters the finished files again and never re-joins the narration. ceiling: a
// voice's peaks run 14 to 18 dB over its loudness, so -20 LUFS leaves room for nearly all of
// them under -2 dBTP; the master then lifts the whole to the target.
export const pieceLufs = -20;
export const pieceTruePeak = -2;

// The Volume control is in dB from the recommended level: 0 dB is the recommendation. Below
// -10 dB a video sounds broken next to others; above +4 dB the peak ceiling squashes the voice.
export const loudnessDbMin = -10;
export const loudnessDbMax = 4;
export const loudnessDbStep = 0.5;

export type LoudnessTarget = "video" | "audioFiles";

// What one file is brought to.
export interface LoudnessGoal {
  // Integrated loudness, LUFS.
  readonly lufs: number;
  // True-peak ceiling, dBTP.
  readonly truePeak: number;
}

// The master a run's file of this kind gets, or undefined while the setting is off.
export function masterGoal(
  config: {
    readonly sources: { readonly audio: string };
    readonly loudness?: LoudnessSettings | undefined;
  },
  target: LoudnessTarget,
): LoudnessGoal | undefined {
  const settings = config.loudness;
  if (settings === undefined || !usesLoudness(config)) return undefined;
  return {
    lufs: target === "video" ? settings.videoLufs : settings.audioFilesLufs,
    truePeak: truePeakOf(target) - encodeHeadroom,
  };
}

export function recommendedLufs(target: LoudnessTarget): number {
  return target === "video" ? recommendedVideoLufs : recommendedAudioFilesLufs;
}

export function truePeakOf(target: LoudnessTarget): number {
  return target === "video" ? videoTruePeak : audioFilesTruePeak;
}

// dB from the recommended level, and back. Stored is the LUFS; the dB is what is shown.
export function dbOfLufs(lufs: number, target: LoudnessTarget): number {
  return round(lufs - recommendedLufs(target), 2);
}

export function lufsOfDb(db: number, target: LoudnessTarget): number {
  return round(recommendedLufs(target) + db, 2);
}

// Loudness as a share of the recommended level, the way a volume knob reads: -6 dB is about
// half as loud, +6 dB about twice. An amplitude ratio, so it matches what the gain does.
export function percentOfDb(db: number): number {
  return Math.round(10 ** (db / 20) * 100);
}

export function dbOfPercent(percent: number): number {
  return round(20 * Math.log10(percent / 100), 2);
}

// Typed dB snapped to the control's step and range; undefined for text that is not a number.
export function snapDb(db: number): number | undefined {
  if (!Number.isFinite(db)) return undefined;
  const snapped = Math.round(db / loudnessDbStep) * loudnessDbStep;
  return Math.min(loudnessDbMax, Math.max(loudnessDbMin, snapped));
}

export function loudnessProblem(lufs: number, target: LoudnessTarget): string | undefined {
  const db = lufs - recommendedLufs(target);
  return Number.isFinite(db) &&
    Number.isInteger(round(db / loudnessDbStep, 6)) &&
    db >= loudnessDbMin - 1e-9 &&
    db <= loudnessDbMax + 1e-9
    ? undefined
    : `The volume must be between ${String(loudnessDbMin)} dB and +${String(loudnessDbMax)} dB of the recommended level, in steps of ${String(loudnessDbStep)} dB. Change it under Level the volume (Play → Outputs → Export, Edit project → Pauses and volume, or Settings → General).`;
}

export function loudnessFields(
  settings: LoudnessSettings | undefined,
): readonly { readonly field: string; readonly message: string }[] {
  if (settings === undefined) return [];
  const fields: { field: string; message: string }[] = [];
  const video = loudnessProblem(settings.videoLufs, "video");
  if (video !== undefined) fields.push({ field: "loudness.videoLufs", message: video });
  const files = loudnessProblem(settings.audioFilesLufs, "audioFiles");
  if (files !== undefined) fields.push({ field: "loudness.audioFilesLufs", message: files });
  return fields;
}

// Whether a run levels and masters its sound: the setting is on and there is a narration.
export function usesLoudness(config: {
  readonly sources: { readonly audio: string };
  readonly loudness?: LoudnessSettings | undefined;
}): boolean {
  return config.loudness !== undefined && config.sources.audio !== "off";
}

// The settings for a new run from the app-wide default; undefined when it is off.
export function loudnessOfDefault(value: LoudnessDefault): LoudnessSettings | undefined {
  return value.enabled
    ? { videoLufs: value.videoLufs, audioFilesLufs: value.audioFilesLufs }
    : undefined;
}

// Play's choice as a draft holds it: absent is Settings' default throughout, and a target left
// out is Settings' own.
export interface LoudnessForm {
  readonly enabled: boolean;
  readonly videoLufs?: number | undefined;
  readonly audioFilesLufs?: number | undefined;
}

export function loudnessOfForm(
  form: LoudnessForm | undefined,
  fallback: LoudnessDefault,
): LoudnessSettings | undefined {
  if (!(form?.enabled ?? fallback.enabled)) return undefined;
  return {
    videoLufs: form?.videoLufs ?? fallback.videoLufs,
    audioFilesLufs: form?.audioFilesLufs ?? fallback.audioFilesLufs,
  };
}

// "0 dB (recommended, -14 LUFS)", "-6 dB (50%, -20 LUFS)".
export function loudnessLabel(lufs: number, target: LoudnessTarget): string {
  const db = dbOfLufs(lufs, target);
  const lufsText = `${formatNumber(lufs)} LUFS`;
  if (db === 0) return `0 dB (recommended, ${lufsText})`;
  return `${db > 0 ? "+" : ""}${formatNumber(db)} dB (${String(percentOfDb(db))}%, ${lufsText})`;
}

// What the levelling found and did, kept on the levelled narration's output.
export interface LoudnessReport {
  // How many pieces were measured.
  readonly pieces: number;
  // How many were too quiet or too short to measure, and were left as they were.
  readonly skipped: number;
  // The loudest piece minus the quietest, in LU, before and after.
  readonly spreadBefore: number;
  readonly spreadAfter: number;
  // The common level the pieces were brought to, in LUFS.
  readonly target: number;
}

// What a mastered export measured once written (the finished file, after its encode), in LUFS
// and dBTP. `target` is the loudness asked for.
export interface MasterReport {
  readonly target: number;
  readonly integrated: number;
  readonly truePeak: number;
}

// The loudest minus the quietest; 0 for fewer than two.
export function spreadOf(values: readonly number[]): number {
  if (values.length < 2) return 0;
  return round(Math.max(...values) - Math.min(...values), 1);
}

export function reportText(report: LoudnessReport): string {
  const pieces = `${String(report.pieces)} ${report.pieces === 1 ? "piece" : "pieces"}`;
  const skipped =
    report.skipped === 0
      ? ""
      : ` (${String(report.skipped)} too short or quiet to measure, left as they were)`;
  return `Levelled ${pieces} to ${formatNumber(report.target)} LUFS${skipped}: the spread was ${formatNumber(report.spreadBefore)} LU, now ${formatNumber(report.spreadAfter)} LU.`;
}

// "Mastered to -14 LUFS: measured -14.1 LUFS, peaks -1.6 dBTP".
export function masterText(report: MasterReport): string {
  return `Mastered to ${formatNumber(report.target)} LUFS: measured ${formatNumber(report.integrated)} LUFS, peaks ${formatNumber(report.truePeak)} dBTP`;
}

function round(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

function formatNumber(value: number): string {
  return String(round(value, 1)).replace("-", "−");
}
