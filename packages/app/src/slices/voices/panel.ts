import type { CaptionCue } from "../subtitles/captions.js";
import type { VoiceFormat } from "./model.js";
import { assInlineColour, type SpeakerStyle } from "./palette.js";

// The podcast and interview layout, drawn by libass with the captions: a row of speaker tiles
// (initials; the cast's portraits once the cast library holds them) over the image flow, the
// speaker who is talking lit in their colour, and their name as a lower third. Pure ASS
// events, so the renderer burns it in with the captions and needs no filter of its own.

export function usesSpeakerPanel(format: VoiceFormat): boolean {
  return format === "podcast" || format === "interview";
}

export interface SpeakerRun {
  readonly speaker: string;
  readonly start: number;
  readonly end: number;
}

// Consecutive cues of one speaker are one run; a pause under 1.5 s does not end it, so the
// tile does not flicker between sentences.
export function speakerRuns(cues: readonly CaptionCue[]): readonly SpeakerRun[] {
  const runs: SpeakerRun[] = [];
  for (const cue of cues) {
    if (cue.speaker === undefined) continue;
    const last = runs.at(-1);
    if (last !== undefined && last.speaker === cue.speaker && cue.start - last.end < 1.5)
      runs[runs.length - 1] = { ...last, end: cue.end };
    else runs.push({ speaker: cue.speaker, start: cue.start, end: cue.end });
  }
  return runs;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1
      ? `${parts[0]?.[0] ?? ""}${parts.at(-1)?.[0] ?? ""}`
      : (parts[0] ?? "").slice(0, 2);
  return letters.toUpperCase();
}

export function speakerPanelEvents(
  cues: readonly CaptionCue[],
  speakers: readonly (SpeakerStyle & { readonly id: string })[],
  frame: { readonly width: number; readonly height: number },
  totalSeconds: number,
): readonly string[] {
  if (speakers.length === 0 || totalSeconds <= 0) return [];
  const { width, height } = frame;
  const size = Math.round(Math.min(width, height) * 0.11);
  const gap = Math.round(size * 0.3);
  const row = speakers.length * size + (speakers.length - 1) * gap;
  const left = Math.round((width - row) / 2);
  const top = Math.round(height * 0.05);
  const end = stamp(totalSeconds);
  const box = (w: number, h: number): string => `m 0 0 l ${w} 0 ${w} ${h} 0 ${h}`;
  const events: string[] = [];
  for (const [index, speaker] of speakers.entries()) {
    const x = left + index * (size + gap);
    events.push(
      `Dialogue: 1,0:00:00.00,${end},Default,,0,0,0,,{\\an7\\pos(${x},${top})\\p1\\bord0\\shad0\\1c&H202020&\\1a&H40&}${box(size, size)}{\\p0}`,
      `Dialogue: 3,0:00:00.00,${end},Default,,0,0,0,,{\\an5\\pos(${x + size / 2},${top + size / 2})\\fs${Math.round(size * 0.4)}\\b1\\bord0\\shad0\\1c${assInlineColour(speaker.colour)}}${plain(initials(speaker.name))}`,
    );
  }
  const index = new Map(speakers.map((speaker, at) => [speaker.id, at]));
  const lowerSize = Math.round(Math.min(width, height) * 0.045);
  for (const run of speakerRuns(cues)) {
    const at = index.get(run.speaker);
    const speaker = at === undefined ? undefined : speakers[at];
    if (at === undefined || speaker === undefined) continue;
    const x = left + at * (size + gap);
    const colour = assInlineColour(speaker.colour);
    const from = stamp(run.start);
    const to = stamp(run.end);
    events.push(
      // The lit tile: an outline in the speaker's colour round their tile.
      `Dialogue: 2,${from},${to},Default,,0,0,0,,{\\an7\\pos(${x},${top})\\p1\\bord${Math.max(3, Math.round(size / 20))}\\shad0\\1a&HFF&\\3c${colour}}${box(size, size)}{\\p0}`,
      // The lower third: the name on a dark band at the left, above where captions sit.
      `Dialogue: 2,${from},${to},Default,,0,0,0,,{\\an1\\pos(${Math.round(width * 0.05)},${Math.round(height * 0.74)})\\fs${lowerSize}\\b1\\bord${Math.round(lowerSize / 3)}\\3c&H101010&\\3a&H60&\\shad0\\1c${colour}\\fad(200,200)}${plain(speaker.name)}`,
    );
  }
  return events;
}

function plain(text: string): string {
  return text
    .replace(/[{}\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stamp(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360_000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}
