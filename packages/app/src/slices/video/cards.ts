import type { Card, EditList } from "./edit-list.js";

// Chapter cards as an ASS script the clips draw with libass, the renderer the captions use,
// so a card is set in the subtitle font without a font-rendering filter of its own (this
// ffmpeg has none). Each card is centred, well above where captions sit by default, and fades
// in and out. Every clip a card shows in gets its own script with the times counted from the
// clip's first frame (`offset`), since a clip's frames count from zero.

// ceiling: the owner's eye. The fades take 0.4 s each of the card's 2.5 s.
const fadeMs = 400;

export function cardsAss(
  edit: Pick<EditList, "width" | "height" | "fps">,
  cards: readonly Card[],
  fontName: string,
  offset = 0,
): string {
  const { width, height, fps } = edit;
  // The title is sized from the frame's short side, so a vertical video's card fits too. At
  // 8% it read as a caption rather than a chapter title; 11% and bold gives it presence.
  const size = Math.round(Math.min(width, height) * 0.11);
  // A wide, blurred, half-clear dark outline: a soft shadow all round that keeps the title
  // readable on a bright picture without a box behind it.
  const outline = Math.max(2, Math.round(size / 10));
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${String(width)}`,
    `PlayResY: ${String(height)}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    // White bold text, the soft outline, no offset shadow, centred (alignment 5), letter-spaced.
    `Style: Card,${fontName.replace(/,/g, " ")},${String(size)},&H00FFFFFF,&H00FFFFFF,&H60000000,&H00000000,-1,0,0,0,100,100,${String(Math.round(size / 12))},0,1,${String(outline)},0,5,${String(Math.round(width * 0.1))},${String(Math.round(width * 0.1))},0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cards.flatMap((card) => {
    const from = card.startFrame - offset;
    const to = from + card.frames;
    if (to <= 0) return [];
    // A card that began before this clip starts with the clip, part way through its fade in
    // (or past it), so it runs on from the clip before without a second fade.
    const before = Math.max(0, (-from / fps) * 1000);
    const length = Math.round((to / fps) * 1000);
    const fade =
      before === 0
        ? `\\fad(${String(fadeMs)},${String(fadeMs)})`
        : `\\fade(${String(Math.round(255 * Math.max(0, 1 - before / fadeMs)))},0,255,0,${String(Math.max(0, Math.round(fadeMs - before)))},${String(length - fadeMs)},${String(length)})`;
    return [
      `Dialogue: 0,${assTime(Math.max(0, from) / fps)},${assTime(to / fps)},Card,,0,0,0,,{\\blur${String(outline)}${fade}${settle(before)}}${assText(card.title)}`,
    ];
  });
  return `${[...header, ...events].join("\n")}\n`;
}

// The title settles from 96% to full size while it fades in, a small movement that reads as
// a title arriving rather than text appearing. A card carried on from the clip before is
// already settled.
function settle(before: number): string {
  if (before >= fadeMs) return "";
  const from = Math.round(96 + (4 * before) / fadeMs);
  return `\\fscx${String(from)}\\fscy${String(from)}\\t(0,${String(Math.round(fadeMs - before))},\\fscx100\\fscy100)`;
}

// h:mm:ss.cc, the centiseconds ASS counts in.
function assTime(seconds: number): string {
  const centis = Math.max(0, Math.round(seconds * 100));
  const h = Math.floor(centis / 360000);
  const m = Math.floor((centis % 360000) / 6000);
  const s = Math.floor((centis % 6000) / 100);
  const c = centis % 100;
  return `${String(h)}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(c).padStart(2, "0")}`;
}

// A title is plain text: braces would start an override block and a backslash an escape, so
// both are replaced, and a line break is a space.
function assText(text: string): string {
  return text.replace(/[{}]/g, "").replace(/\\/g, "/").replace(/\s+/g, " ").trim();
}
