import { assInlineColour, type CaptionSpeakers } from "../voices/palette.js";
import { subtitlePlacement } from "./layout.js";
import type { SubtitleConfig, TimedWord } from "./model.js";

export interface CaptionCue {
  readonly start: number;
  readonly end: number;
  readonly text: string;
  // The speaker's id in a multi-voice run; absent everywhere else.
  readonly speaker?: string | undefined;
}
type SpokenWord = TimedWord & { readonly speaker?: string | undefined };

// Keep spoken spelling and punctuation. Word times come only from acoustic alignment. A cue
// never holds two speakers' words.
export function captionCues(words: readonly SpokenWord[]): readonly CaptionCue[] {
  const cues: CaptionCue[] = [];
  let pending: SpokenWord[] = [];
  let previousEnd = 0;
  const flush = (): void => {
    const first = pending[0];
    const last = pending.at(-1);
    if (first !== undefined && last !== undefined) {
      cues.push({
        start: first.start,
        end: last.end,
        text: wrap(pending.map((word) => word.text)),
        ...(first.speaker === undefined ? {} : { speaker: first.speaker }),
      });
    }
    pending = [];
  };
  for (const word of words) {
    if (
      !Number.isFinite(word.start) ||
      !Number.isFinite(word.end) ||
      word.start < previousEnd - 0.001 ||
      word.end <= word.start
    ) {
      throw new Error(
        "The saved caption timing is damaged. Use More → Render the video again in the Video section to time them again, then Try again.",
      );
    }
    const first = pending[0];
    if (
      first !== undefined &&
      (word.start - previousEnd > 0.7 ||
        word.speaker !== first.speaker ||
        word.end - first.start > 5 ||
        wrap([...pending.map((one) => one.text), word.text]).split("\n").length > 2)
    ) {
      flush();
    }
    pending.push({ ...word, text: word.text.replace(/\s+/g, " ").trim() });
    previousEnd = word.end;
    if (/[.!?]["'’”)]*$/.test(word.text)) flush();
  }
  flush();
  return cues;
}

function wrap(words: readonly string[]): string {
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line !== "" && line.length + word.length + 1 > 42) {
      lines.push(line);
      line = "";
    }
    line = line === "" ? word : `${line} ${word}`;
  }
  if (line !== "") lines.push(line);
  return lines.join("\n");
}

export function serializeSrt(cues: readonly CaptionCue[], speakers?: CaptionSpeakers): string {
  return cues
    .map(
      (cue, index) =>
        `${index + 1}\n${stamp(cue.start, ",")} --> ${stamp(cue.end, ",")}\n${markup(`${nameTag(cue, speakers)}${cue.text}`)}\n`,
    )
    .join("\n");
}
// WebVTT names the speaker in its own voice span, which players can show or style.
export function serializeVtt(cues: readonly CaptionCue[], speakers?: CaptionSpeakers): string {
  return `WEBVTT\n\n${cues.map((cue) => `${stamp(cue.start, ".")} --> ${stamp(cue.end, ".")}\n${voiceSpan(cue, speakers)}${markup(cue.text)}\n`).join("\n")}`;
}
function styleOf(cue: CaptionCue, speakers: CaptionSpeakers | undefined) {
  return cue.speaker === undefined ? undefined : speakers?.styles[cue.speaker];
}
function nameTag(cue: CaptionCue, speakers: CaptionSpeakers | undefined): string {
  const style = styleOf(cue, speakers);
  return style !== undefined && speakers?.nameTags === true ? `${style.name}: ` : "";
}
function voiceSpan(cue: CaptionCue, speakers: CaptionSpeakers | undefined): string {
  const style = styleOf(cue, speakers);
  return style === undefined ? "" : `<v ${style.name.replace(/[<>&]/g, "")}>`;
}
// The speaker's colour, and their name in bold ahead of the words when name tags are on.
function speakerAss(cue: CaptionCue, speakers: CaptionSpeakers | undefined): string {
  const style = styleOf(cue, speakers);
  if (style === undefined) return "";
  const colour = `{\\1c${assInlineColour(style.colour)}}`;
  return speakers?.nameTags === true ? `${colour}{\\b1}${assText(style.name)}:{\\b0} ` : colour;
}

interface SubtitleStyle {
  readonly width: number;
  readonly height: number;
  readonly fontName: string;
  readonly fontSize: number;
  readonly position?: SubtitleConfig["position"];
  // #RRGGBB from the brand kit; absent is white text with the near-black outline.
  readonly color?: string | undefined;
  readonly outlineColor?: string | undefined;
  readonly speakers?: CaptionSpeakers | undefined;
  // Events drawn with the captions (the podcast speaker panel), already formatted.
  readonly overlay?: readonly string[] | undefined;
}
export function serializeAss(cues: readonly CaptionCue[], style: SubtitleStyle): string {
  const name = style.fontName.replace(/[\p{Cc},]/gu, " ").trim();
  const placement = subtitlePlacement(style.position ?? "bottom", style.height);
  const position = `{\\an${placement.alignment}\\pos(${style.width / 2},${placement.y})}`;
  const header = `[Script Info]\nScriptType: v4.00+\nPlayResX: ${style.width}\nPlayResY: ${style.height}\nWrapStyle: 0\nScaledBorderAndShadow: yes\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,${name},${style.fontSize},${assColour(style.color, "&H00FFFFFF")},${assColour(style.color, "&H00FFFFFF")},${assColour(style.outlineColor, "&H00101010")},&H80000000,0,0,0,0,100,100,0,0,1,2.5,1,2,60,60,60,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n`;
  return (
    header +
    cues
      .map(
        (cue) =>
          `Dialogue: 0,${assStamp(cue.start)},${assStamp(cue.end)},Default,,0,0,0,,${position}${speakerAss(cue, style.speakers)}${assText(cue.text)}\n`,
      )
      .join("") +
    (style.overlay ?? []).map((line) => `${line}\n`).join("")
  );
}
function markup(text: string): string {
  return text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function assText(text: string): string {
  // Full-width alternatives stay visible and cannot open an ASS override or escape.
  return text
    .replaceAll("\\", "＼")
    .replaceAll("{", "｛")
    .replaceAll("}", "｝")
    .replaceAll("\n", "\\N");
}
function stamp(seconds: number, separator: string): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  return `${String(Math.floor(ms / 3_600_000)).padStart(2, "0")}:${String(Math.floor(ms / 60_000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
}
function assStamp(seconds: number): string {
  const cs = Math.max(0, Math.round(seconds * 100));
  return `${Math.floor(cs / 360_000)}:${String(Math.floor(cs / 6000) % 60).padStart(2, "0")}:${String(Math.floor(cs / 100) % 60).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
}

// ASS colours are &HAABBGGRR, alpha 00 being opaque.
export function assColour(hex: string | undefined, fallback: string): string {
  const match =
    hex === undefined ? null : /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (match === null) return fallback;
  const [, r, g, b] = match;
  return `&H00${(b ?? "").toUpperCase()}${(g ?? "").toUpperCase()}${(r ?? "").toUpperCase()}`;
}
