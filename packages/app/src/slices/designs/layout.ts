import { render } from "../admission/substitute.js";
import { assColour, assText } from "../video/ass-text.js";
import type { Frame } from "./frames.js";
import type { BlockRole, LayoutPreset } from "./model.js";
import type { DesignText } from "./schema.js";

// The text layer of a designed piece as one ASS script, drawn over the cropped artwork by the
// ffmpeg Slopify ships (`render.ts`). Pure: the same text, values and frame always make the
// same script. Every value is placed verbatim, wrapped by an advance estimate (the figure
// cards' approach) and shrunk until it fits, never below 2.4% of the short side; text is never
// dropped, so a piece too full to fit says so (`overflow`) instead of losing a word.

export interface LayoutFont {
  // The family libass is asked for; the render copies the font file into its fonts folder.
  readonly assName: string;
}

export interface PlacedLine {
  readonly blockId: string;
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly width: number;
}

export interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface TextLayout {
  readonly ass: string;
  readonly area: Area;
  readonly lines: readonly PlacedLine[];
  readonly overflow: boolean;
}

export const minTextShare = 0.024;
const roleShare: Readonly<Record<BlockRole, number>> = {
  headline: 0.11,
  subhead: 0.06,
  details: 0.045,
  small: 0.03,
};
const lineSpacing = 1.2;
const blockGap = 0.45;

// Average advance per em: about half for mixed case, more for capitals.
export function advanceOf(text: string): number {
  const letters = [...text].filter((ch) => /\p{L}/u.test(ch));
  const upper = letters.filter((ch) => ch !== ch.toLowerCase()).length;
  return letters.length > 0 && upper / letters.length > 0.6 ? 0.68 : 0.56;
}

export function estimatedWidth(text: string, size: number): number {
  return [...text].length * size * advanceOf(text);
}

export function safeArea(frame: Pick<Frame, "width" | "height">, preset: LayoutPreset): Area {
  const { width, height } = frame;
  const margin = Math.round(Math.min(width, height) * 0.06);
  switch (preset) {
    case "top-title":
      return {
        x: margin,
        y: margin,
        width: width - margin * 2,
        height: Math.round(height * 0.45) - margin,
      };
    case "bottom-band": {
      const top = Math.round(height * 0.62);
      return { x: margin, y: top, width: width - margin * 2, height: height - top - margin };
    }
    case "centered":
      return { x: margin, y: margin, width: width - margin * 2, height: height - margin * 2 };
    case "left-column":
      return {
        x: margin,
        y: margin,
        width: Math.round(width * 0.5) - margin,
        height: height - margin * 2,
      };
  }
}

// Greedy wrap by estimated width; a word wider than the line is broken, so nothing leaves
// the area sideways.
export function wrapText(text: string, size: number, room: number): string[] {
  const lines: string[] = [];
  let line = "";
  const fits = (candidate: string) => estimatedWidth(candidate, size) <= room;
  for (const word of text.split(/\s+/).filter((part) => part !== "")) {
    const candidate = line === "" ? word : `${line} ${word}`;
    if (fits(candidate)) {
      line = candidate;
      continue;
    }
    if (line !== "") lines.push(line);
    line = "";
    let rest = word;
    while (!fits(rest)) {
      let cut = Math.max(1, [...rest].length - 1);
      while (cut > 1 && !fits([...rest].slice(0, cut).join(""))) cut -= 1;
      lines.push([...rest].slice(0, cut).join(""));
      rest = [...rest].slice(cut).join("");
    }
    line = rest;
  }
  if (line !== "") lines.push(line);
  return lines;
}

interface Sized {
  readonly id: string;
  readonly lines: readonly string[];
  readonly size: number;
  readonly fontName: string;
  readonly color: string;
}

export function layoutText(
  frame: Pick<Frame, "width" | "height">,
  text: DesignText,
  values: Readonly<Record<string, string>>,
  fonts: Readonly<Record<string, LayoutFont>>,
): TextLayout {
  const short = Math.min(frame.width, frame.height);
  const floor = Math.round(short * minTextShare);
  const area = safeArea(frame, text.preset);
  const blocks = text.blocks
    .map((block) => ({ ...block, filled: render(block.text, values).replace(/\s+/g, " ").trim() }))
    .filter((block) => block.filled !== "");
  const size = (role: BlockRole, scale: number) =>
    Math.max(floor, Math.round(short * roleShare[role] * scale));
  const sized = (scale: number): Sized[] =>
    blocks.map((block) => {
      const at = size(block.role, scale);
      return {
        id: block.id,
        lines: wrapText(block.filled, at, area.width),
        size: at,
        fontName: fonts[block.fontId]?.assName ?? "Barlow",
        color: block.color,
      };
    });
  const heightOf = (set: readonly Sized[]) =>
    set.reduce(
      (sum, block, index) =>
        sum +
        block.lines.length * block.size * lineSpacing +
        (index === 0 ? 0 : block.size * blockGap),
      0,
    );
  let scale = 1;
  let set = sized(scale);
  while (heightOf(set) > area.height && set.some((block) => block.size > floor)) {
    scale *= 0.92;
    set = sized(scale);
  }
  const total = heightOf(set);
  const overflow = total > area.height;
  const vertical =
    text.preset === "top-title" ? 0 : (area.height - Math.min(total, area.height)) / 2;
  const left = text.preset === "left-column";
  const lines: PlacedLine[] = [];
  let y = area.y + vertical;
  for (const [index, block] of set.entries()) {
    if (index > 0) y += block.size * blockGap;
    for (const line of block.lines) {
      lines.push({
        blockId: block.id,
        text: line,
        x: Math.round(left ? area.x : area.x + area.width / 2),
        y: Math.round(y),
        size: block.size,
        width: Math.round(estimatedWidth(line, block.size)),
      });
      y += block.size * lineSpacing;
    }
  }
  const events = [
    ...scrimEvents(text, frame, area, lines),
    ...lines.map((line) => {
      const block = set.find((one) => one.id === line.blockId);
      const outline = text.scrim === "none" ? Math.max(1, Math.round(line.size * 0.035)) : 0;
      return dialogue(
        1,
        `{\\an${left ? "7" : "8"}\\pos(${String(line.x)},${String(line.y)})\\fn${(block?.fontName ?? "Barlow").replace(/[\\{}]/g, "")}\\fs${String(line.size)}\\c${assColour(block?.color ?? "#FFFFFF")}\\bord${String(outline)}\\3c&H000000&\\shad0}${assText(line.text)}`,
      );
    }),
  ];
  return { ass: script(frame, events), area, lines, overflow };
}

function scrimEvents(
  { scrim, preset }: Pick<DesignText, "scrim" | "preset">,
  frame: Pick<Frame, "width" | "height">,
  area: Area,
  lines: readonly PlacedLine[],
): string[] {
  if (scrim === "none" || lines.length === 0) return [];
  const first = lines[0];
  const last = lines.at(-1);
  if (first === undefined || last === undefined) return [];
  const pad = Math.round(Math.min(frame.width, frame.height) * 0.03);
  // A band under a bottom or top title runs to that edge of the frame.
  const band = scrim === "band";
  const top = band && preset === "top-title" ? 0 : Math.max(0, first.y - pad);
  const bottom =
    band && preset === "bottom-band"
      ? frame.height
      : Math.min(frame.height, last.y + last.size * lineSpacing + pad);
  // A band runs the frame's full width; a soft scrim sits behind the text area only.
  const [x0, x1, alpha] = band
    ? [0, frame.width, "&H40&"]
    : [Math.max(0, area.x - pad), Math.min(frame.width, area.x + area.width + pad), "&H80&"];
  const corners = [x0, top, x1, bottom].map((n) => String(Math.round(n)));
  const [a, b, c, d] = corners;
  return [
    dialogue(
      0,
      `{\\an7\\pos(0,0)\\p1\\bord0\\shad0\\c&H000000&\\1a${alpha}}m ${a ?? "0"} ${b ?? "0"} l ${c ?? "0"} ${b ?? "0"} l ${c ?? "0"} ${d ?? "0"} l ${a ?? "0"} ${d ?? "0"}{\\p0}`,
    ),
  ];
}

function dialogue(layer: number, body: string): string {
  return `Dialogue: ${String(layer)},0:00:00.00,0:00:10.00,Design,,0,0,0,,${body}`;
}

function script(frame: Pick<Frame, "width" | "height">, events: readonly string[]): string {
  return `${[
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${String(frame.width)}`,
    `PlayResY: ${String(frame.height)}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Design,Barlow,${String(Math.round(Math.min(frame.width, frame.height) * 0.04))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
  ].join("\n")}\n`;
}
