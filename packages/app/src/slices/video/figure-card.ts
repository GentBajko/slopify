import type { Nodes, Table } from "mdast";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import type { Log } from "../../kernel/log.js";
import type { DescribedKind } from "../narration/blocks.js";
import { runFfmpeg } from "./ffmpeg.js";

// "Show tables and figures on screen": each table, figure, equation and code block the
// narration describes is also drawn as a picture the video shows while the description is
// spoken. A card is one frame drawn by the ffmpeg Slopify ships: a solid ground from `lavfi`,
// the article's own picture scaled onto it for a figure, and everything else set as an ASS
// script with libass, the renderer the captions and chapter cards use (this ffmpeg has no
// other text filter). No network, no paid call, and the same block always draws the same card.

export interface CardStyle {
  // #RRGGBB.
  readonly ground: string;
  readonly ink: string;
  readonly muted: string;
  readonly accent: string;
  readonly line: string;
  // Family names libass is asked for; the fonts folder holds the text font.
  readonly font: string;
  readonly mono: string;
}

// The 3.0 design tokens (`packages/web/src/styles/index.css`): the surface graphite, ink,
// the second ink, Slopify lime and the line colour, in the bundled Barlow.
export const defaultCardStyle: CardStyle = {
  ground: "#19191c",
  ink: "#ece9e2",
  muted: "#a9a69e",
  accent: "#a6d45c",
  line: "#2a2a30",
  font: "Barlow",
  mono: "DejaVu Sans Mono",
};

export interface CardInput {
  readonly kind: DescribedKind;
  // The block as the article has it (`narration/blocks.ts`): Markdown for a table, the fenced
  // source for code, a diagram and an equation, "Alt text:"/"Caption:" lines for a figure.
  readonly source: string;
  readonly section: string | null;
  readonly width: number;
  readonly height: number;
  readonly style: CardStyle;
  // A figure whose picture is drawn on the card; without one the card shows its caption.
  readonly picture: boolean;
}

export interface CardLayout {
  readonly ass: string;
  // Where a figure's picture is fitted, in pixels.
  readonly box?:
    | { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
    | undefined;
}

// ceiling: the owner's eye at 1080p. Text never smaller than 2.4% of the short side (26 px on
// a 1080-line frame), so a card stays readable on a phone; a table with more rows than fit at
// that size says how many it left out.
const minShare = 0.024;
const rowSpacing = 1.55;
const lineSpacing = 1.35;
// Barlow's average advance is about half its size; a monospace face's is 0.6.
const textAdvance = 0.52;
const monoAdvance = 0.6;

export function cardLayout(input: CardInput): CardLayout {
  const { width, height } = input;
  const short = Math.min(width, height);
  const margin = Math.round(short * 0.07);
  const events: string[] = [];
  let top = margin;
  const label = labelOf(input);
  if (label !== "") {
    const size = Math.round(short * 0.03);
    events.push(
      text(
        margin,
        top,
        7,
        `{\\fs${String(size)}\\c${colour(input.style.accent)}}${assText(label)}`,
      ),
    );
    top += Math.round(size * 1.9);
  }
  const area = { x: margin, y: top, width: width - margin * 2, height: height - top - margin };
  let box: CardLayout["box"];
  switch (input.kind) {
    case "table":
      events.push(...tableEvents(input, area));
      break;
    case "figure": {
      const caption = figureCaption(input.source);
      const size = Math.round(short * 0.032);
      const lines = wrap(caption, Math.floor(area.width / (size * textAdvance)), 3);
      const captionHeight = lines.length === 0 ? 0 : Math.round(lines.length * size * lineSpacing);
      if (input.picture) {
        box = {
          x: area.x,
          y: area.y,
          width: area.width,
          height: Math.max(1, area.height - captionHeight - (lines.length === 0 ? 0 : size)),
        };
        for (const [at, line] of lines.entries())
          events.push(
            text(
              width / 2,
              area.y + area.height - captionHeight + at * size * lineSpacing,
              8,
              `{\\fs${String(size)}\\c${colour(input.style.muted)}}${assText(line)}`,
            ),
          );
      } else {
        // No picture to show: the caption itself, large, as the figure's card.
        const big = Math.round(short * 0.05);
        const said = wrap(caption || "Figure", Math.floor(area.width / (big * textAdvance)), 6);
        const start = area.y + (area.height - said.length * big * lineSpacing) / 2;
        for (const [at, line] of said.entries())
          events.push(
            text(
              width / 2,
              start + at * big * lineSpacing,
              8,
              `{\\fs${String(big)}\\c${colour(input.style.ink)}}${assText(line)}`,
            ),
          );
      }
      break;
    }
    case "math":
      events.push(...mathEvents(input, area));
      break;
    case "code":
    case "diagram":
      events.push(...codeEvents(input, area));
      break;
  }
  return { ass: script(input, events), ...(box === undefined ? {} : { box }) };
}

// The ffmpeg arguments that draw the card to `output` (a PNG) in `cwd`, which holds
// `card.ass` and a `fonts` folder.
export function cardArgs(
  input: Pick<CardInput, "width" | "height" | "style">,
  layout: CardLayout,
  output: string,
  picture?: string,
): string[] {
  const ground = `color=c=0x${input.style.ground.slice(1)}:s=${String(input.width)}x${String(input.height)}:d=1`;
  const box = layout.box;
  if (picture === undefined || box === undefined)
    return [
      ...["-hide_banner", "-nostdin", "-loglevel", "error", "-y", "-f", "lavfi", "-i", ground],
      ...["-vf", "ass=filename=card.ass:fontsdir=fonts", "-frames:v", "1", output],
    ];
  return [
    ...[
      "-hide_banner",
      "-nostdin",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      ground,
      "-i",
      picture,
    ],
    "-filter_complex",
    [
      `[1:v]scale=${String(box.width)}:${String(box.height)}:force_original_aspect_ratio=decrease:flags=lanczos,format=rgba[pic]`,
      `[0:v][pic]overlay=x=${String(box.x)}+(${String(box.width)}-overlay_w)/2:y=${String(box.y)}+(${String(box.height)}-overlay_h)/2:format=auto,ass=filename=card.ass:fontsdir=fonts[v]`,
    ].join(";"),
    ...["-map", "[v]", "-frames:v", "1", output],
  ];
}

export interface CardRender {
  readonly bin: string;
  readonly input: CardInput;
  readonly cwd: string;
  readonly output: string;
  readonly picture?: string | undefined;
  readonly signal: AbortSignal;
  readonly log: Log;
}

export async function renderCard(run: CardRender, write: (ass: string) => void): Promise<void> {
  const layout = cardLayout(run.input);
  write(layout.ass);
  await runFfmpeg({
    bin: run.bin,
    args: cardArgs(run.input, layout, run.output, run.picture),
    cwd: run.cwd,
    signal: run.signal,
    log: run.log,
    onProgress: () => undefined,
  });
}

function labelOf(input: CardInput): string {
  const section = input.section?.trim() ?? "";
  if (input.kind === "code") {
    const lang = /^```\s*([\w+#.-]+)/.exec(input.source)?.[1];
    return [section, lang].filter((part) => part !== undefined && part !== "").join("  ·  ");
  }
  return section;
}

interface Area {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// A table as a clean grid: the header in the accent colour over a rule, a hairline between
// rows, numbers right-aligned. Sized to fit; past the smallest readable size the rows that do
// not fit are left out and counted.
function tableEvents(input: CardInput, area: Area): string[] {
  const rows = tableRows(input.source);
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const columns = Math.max(1, ...rows.map((row) => row.length));
  const short = Math.min(input.width, input.height);
  const smallest = Math.round(short * minShare);
  const largest = Math.round(short * 0.045);
  // Every row but the header, and a line for what was left out when some are.
  let shown = body.length;
  let size = Math.floor(area.height / ((shown + 1) * rowSpacing));
  if (size < smallest) {
    size = smallest;
    shown = Math.max(1, Math.floor(area.height / (size * rowSpacing)) - 2);
  }
  size = Math.min(size, largest);
  const cells = (row: readonly string[]) =>
    Array.from({ length: columns }, (_value, at) => row[at] ?? "");
  const kept = [cells(header), ...body.slice(0, shown).map(cells)];
  // Each column as wide as its widest cell (at most 28 letters); cut to fit if need be.
  const letters = Array.from({ length: columns }, (_value, at) =>
    Math.min(28, Math.max(3, ...kept.map((row) => (row[at] ?? "").length))),
  );
  const gap = 1.6;
  const wanted = (letters.reduce((sum, n) => sum + n, 0) + gap * columns) * size * textAdvance;
  if (wanted > area.width) size = Math.max(smallest, Math.floor((size * area.width) / wanted));
  const scale =
    area.width /
    Math.max(
      area.width,
      (letters.reduce((sum, n) => sum + n, 0) + gap * columns) * size * textAdvance,
    );
  const widths = letters.map((n) => (n + gap) * size * textAdvance * scale);
  const room = (at: number) =>
    Math.max(3, Math.floor((widths[at] ?? 0) / (size * textAdvance)) - 1);
  const rowHeight = Math.round(size * rowSpacing);
  const events: string[] = [];
  // Centred across the card; a narrow table is not pushed into a corner.
  const tableWidth = widths.reduce((sum, n) => sum + n, 0);
  const left = area.x + Math.max(0, (area.width - tableWidth) / 2);
  const right = left + tableWidth;
  kept.forEach((row, index) => {
    const y = area.y + index * rowHeight;
    let x = left;
    row.forEach((cell, at) => {
      const value = clip(cell, room(at));
      const numeric =
        index > 0 && /^[-+−]?[\d.,]+\s*%?$|^[-+−]?[\d.,]+\s*[a-zA-Zµ%/]{0,4}$/.test(cell.trim());
      const cellWidth = widths[at] ?? 0;
      const colourTag = index === 0 ? colour(input.style.accent) : colour(input.style.ink);
      events.push(
        numeric
          ? text(
              x + cellWidth - size * 0.8,
              y + rowHeight / 2,
              6,
              `{\\fs${String(size)}\\c${colourTag}}${assText(value)}`,
            )
          : text(
              x,
              y + rowHeight / 2,
              4,
              `{\\fs${String(size)}\\c${colourTag}${index === 0 ? "\\b1" : ""}}${assText(value)}`,
            ),
      );
      x += cellWidth;
    });
    // The rule under the header is the accent's; the rest are hairlines.
    const under = y + rowHeight;
    const thick = index === 0 ? Math.max(2, Math.round(size / 10)) : 1;
    events.push(
      rule(left, under, right - left, thick, index === 0 ? input.style.accent : input.style.line),
    );
  });
  const leftOut = body.length - Math.min(shown, body.length);
  if (leftOut > 0)
    events.push(
      text(
        left,
        area.y + kept.length * rowHeight + rowHeight / 2,
        4,
        `{\\fs${String(size)}\\c${colour(input.style.muted)}\\i1}${assText(`…and ${String(leftOut)} more ${leftOut === 1 ? "row" : "rows"}`)}`,
      ),
    );
  return events;
}

function tableRows(markdown: string): string[][] {
  const tree = remark().use(remarkGfm).parse(markdown);
  const table = tree.children.find((node): node is Table => node.type === "table");
  if (table === undefined) return [];
  return table.children.map((row) => row.children.map((cell) => plain(cell).trim()));
}

function plain(node: Nodes): string {
  if ("value" in node && typeof node.value === "string") return node.value;
  if (node.type === "image") return node.alt ?? "";
  if ("children" in node) return node.children.map((child) => plain(child)).join("");
  return "";
}

// Code and drawings in the monospace face, one line per line, with simple colouring: comments
// muted, strings and numbers in the ink's warm second tone, keywords in the accent.
function codeEvents(input: CardInput, area: Area): string[] {
  const lines = fenced(input.source).split("\n");
  const longest = Math.max(12, ...lines.map((line) => line.length));
  const short = Math.min(input.width, input.height);
  const smallest = Math.round(short * minShare * 0.9);
  let size = Math.min(
    Math.round(short * 0.04),
    Math.floor(area.width / (longest * monoAdvance)),
    Math.floor(area.height / (lines.length * lineSpacing)),
  );
  let shown = lines.length;
  if (size < smallest) {
    size = smallest;
    shown = Math.max(1, Math.floor(area.height / (size * lineSpacing)) - 1);
  }
  const room = Math.floor(area.width / (size * monoAdvance));
  // A short program sits in the middle of the card rather than at its top.
  const top = area.y + Math.max(0, (area.height - shown * size * lineSpacing) / 2);
  const events = lines
    .slice(0, shown)
    .map((line, at) =>
      text(
        area.x,
        top + at * size * lineSpacing,
        7,
        `{\\fn${input.style.mono}\\fs${String(size)}\\c${colour(input.style.ink)}}${
          input.kind === "code"
            ? coloured(clip(line, room), input.style)
            : assText(clip(line, room), true)
        }`,
      ),
    );
  if (shown < lines.length)
    events.push(
      text(
        area.x,
        top + shown * size * lineSpacing,
        7,
        `{\\fs${String(size)}\\c${colour(input.style.muted)}\\i1}${assText(`…and ${String(lines.length - shown)} more lines`)}`,
      ),
    );
  return events;
}

const keywords = new Set(
  "fn let mut pub use mod impl struct enum trait match if else for while loop return break continue in as where const static async await function var class extends new this def import from export type interface yield lambda try catch except finally raise throw public private protected void int float double bool boolean char string true false null None nil self Self package func go defer select case switch default".split(
    " ",
  ),
);

function coloured(line: string, style: CardStyle): string {
  const comment = /(\/\/|#(?!\[)|--\s).*$/.exec(line);
  const code = comment === null ? line : line.slice(0, comment.index);
  const out = code.replace(
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b\d[\d._]*\b|\b[A-Za-z_]\w*\b|[^"'\w]+)/g,
    (token) => {
      if (/^["']/.test(token))
        return `{\\c${colour(style.muted)}}${assText(token, true)}{\\c${colour(style.ink)}}`;
      if (/^\d/.test(token))
        return `{\\c${colour(style.muted)}}${assText(token, true)}{\\c${colour(style.ink)}}`;
      if (keywords.has(token))
        return `{\\c${colour(style.accent)}}${token}{\\c${colour(style.ink)}}`;
      return assText(token, true);
    },
  );
  return comment === null
    ? out
    : `${out}{\\c${colour(style.muted)}\\i1}${assText(comment[0], true)}`;
}

// An equation set in readable text: TeX's commands as the symbols they stand for, powers
// and indices as superscripts and subscripts where Unicode has them, centred and large.
function mathEvents(input: CardInput, area: Area): string[] {
  const tex = input.source
    .replace(/^\$\$|\$\$$/g, "")
    .replace(/^\\\[|\\\]$/g, "")
    .replace(/^```\s*\w*\n?|```$/g, "")
    .trim();
  // A paragraph with formulas in it shows the paragraph with its formulas set.
  const said = /\$[^$]+\$/.test(tex)
    ? tex.replace(/\$\$?([^$]+)\$\$?/g, (_all, inner: string) => typeset(inner))
    : typeset(tex);
  const short = Math.min(input.width, input.height);
  const size = Math.round(short * (said.length > 60 ? 0.04 : 0.06));
  const lines = wrap(said, Math.floor(area.width / (size * textAdvance)), 6);
  const start = area.y + (area.height - lines.length * size * lineSpacing) / 2;
  return lines.map((line, at) =>
    text(
      input.width / 2,
      start + at * size * lineSpacing,
      8,
      `{\\fs${String(size)}\\c${colour(input.style.ink)}}${assText(line)}`,
    ),
  );
}

const symbols: Readonly<Record<string, string>> = {
  alpha: "α",
  beta: "β",
  gamma: "γ",
  delta: "δ",
  epsilon: "ε",
  varepsilon: "ε",
  zeta: "ζ",
  eta: "η",
  theta: "θ",
  iota: "ι",
  kappa: "κ",
  lambda: "λ",
  mu: "μ",
  nu: "ν",
  xi: "ξ",
  pi: "π",
  rho: "ρ",
  sigma: "σ",
  tau: "τ",
  upsilon: "υ",
  phi: "φ",
  varphi: "φ",
  chi: "χ",
  psi: "ψ",
  omega: "ω",
  Gamma: "Γ",
  Delta: "Δ",
  Theta: "Θ",
  Lambda: "Λ",
  Xi: "Ξ",
  Pi: "Π",
  Sigma: "Σ",
  Phi: "Φ",
  Psi: "Ψ",
  Omega: "Ω",
  cdot: "·",
  times: "×",
  div: "÷",
  pm: "±",
  mp: "∓",
  le: "≤",
  leq: "≤",
  ge: "≥",
  geq: "≥",
  neq: "≠",
  ne: "≠",
  approx: "≈",
  sim: "∼",
  equiv: "≡",
  propto: "∝",
  infty: "∞",
  partial: "∂",
  nabla: "∇",
  sum: "Σ",
  prod: "Π",
  int: "∫",
  to: "→",
  rightarrow: "→",
  leftarrow: "←",
  Rightarrow: "⇒",
  in: "∈",
  forall: "∀",
  exists: "∃",
  ldots: "…",
  cdots: "⋯",
  degree: "°",
  circ: "°",
};
const superscripts: Readonly<Record<string, string>> = {
  "0": "⁰",
  "1": "¹",
  "2": "²",
  "3": "³",
  "4": "⁴",
  "5": "⁵",
  "6": "⁶",
  "7": "⁷",
  "8": "⁸",
  "9": "⁹",
  "+": "⁺",
  "-": "⁻",
  "=": "⁼",
  "(": "⁽",
  ")": "⁾",
  n: "ⁿ",
  i: "ⁱ",
};
const subscripts: Readonly<Record<string, string>> = {
  "0": "₀",
  "1": "₁",
  "2": "₂",
  "3": "₃",
  "4": "₄",
  "5": "₅",
  "6": "₆",
  "7": "₇",
  "8": "₈",
  "9": "₉",
  "+": "₊",
  "-": "₋",
  "=": "₌",
  "(": "₍",
  ")": "₎",
  a: "ₐ",
  e: "ₑ",
  o: "ₒ",
  x: "ₓ",
  i: "ᵢ",
  j: "ⱼ",
  k: "ₖ",
  n: "ₙ",
  t: "ₜ",
  s: "ₛ",
  r: "ᵣ",
  m: "ₘ",
  p: "ₚ",
};

export function typeset(tex: string): string {
  let out = tex
    .replace(/\\(left|right|big|Big|bigg|Bigg|displaystyle|,|;|!|quad|qquad)\b/g, " ")
    .replace(/\\(mathrm|mathbf|mathit|text|operatorname)\{([^}]*)\}/g, "$2");
  // Innermost first, so a fraction inside a root comes out whole.
  for (let pass = 0; pass < 4; pass++)
    out = out
      .replace(
        /\\frac\{([^{}]*)\}\{([^{}]*)\}/g,
        (_all, a: string, b: string) => `${group(a)}/${group(b)}`,
      )
      .replace(/\\sqrt\{([^{}]*)\}/g, (_all, a: string) => `√${group(a)}`);
  out = out
    .replace(/\\([A-Za-z]+)/g, (_all, name: string) => symbols[name] ?? name)
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (_all, a: string | undefined, b: string | undefined) =>
      scripted(a ?? b ?? "", superscripts, "^"),
    )
    .replace(/_\{([^{}]*)\}|_(\S)/g, (_all, a: string | undefined, b: string | undefined) =>
      scripted(a ?? b ?? "", subscripts, "_"),
    )
    .replace(/[{}]/g, "")
    .replace(/\s*([=<>≤≥≈≠+×·−])\s*/g, " $1 ")
    .replace(/\s+/g, " ")
    .trim();
  return out;
}

function group(text: string): string {
  const clean = text.trim();
  return /^[\w.]+$/.test(clean) ? clean : `(${clean})`;
}

function scripted(text: string, map: Readonly<Record<string, string>>, mark: string): string {
  const letters = [...text];
  return letters.every((letter) => map[letter] !== undefined)
    ? letters.map((letter) => map[letter]).join("")
    : `${mark}(${text})`;
}

function figureCaption(source: string): string {
  const lines = source.split("\n");
  const captions = lines
    .filter((line) => line.startsWith("Caption: "))
    .map((line) => line.slice(9));
  const alt = lines.find((line) => line.startsWith("Alt text: "))?.slice(10);
  return (captions.length > 0 ? captions.join(" ") : (alt ?? "")).trim();
}

function fenced(source: string): string {
  return source
    .replace(/^\s*(```|~~~)[^\n]*\n?/, "")
    .replace(/\n?(```|~~~)\s*$/, "")
    .replace(/\t/g, "    ")
    .replace(/\s+$/, "");
}

function wrap(textValue: string, width: number, most: number): string[] {
  const words = textValue.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line === "") line = word;
    else if (line.length + 1 + word.length <= width) line += ` ${word}`;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length <= most) return lines;
  const kept = lines.slice(0, most);
  kept[most - 1] = clip(`${kept[most - 1] ?? ""} …`, width);
  return kept;
}

function clip(value: string, room: number): string {
  return value.length <= room ? value : `${value.slice(0, Math.max(1, room - 1))}…`;
}

// Text as libass draws it literally: braces and backslashes escaped rather than read as
// override tags; code keeps its spaces, prose has them collapsed.
function assText(value: string, keepSpaces = false): string {
  const escaped = value.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  return keepSpaces
    ? escaped.replace(/ {2,}/g, (run) => "\\h".repeat(run.length))
    : escaped.replace(/\s+/g, " ");
}

function colour(hex: string): string {
  const match = /^#([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})([0-9A-Fa-f]{2})$/.exec(hex);
  if (match === null) return "&HFFFFFF&";
  const [, r, g, b] = match;
  return `&H${(b ?? "").toUpperCase()}${(g ?? "").toUpperCase()}${(r ?? "").toUpperCase()}&`;
}

function text(x: number, y: number, align: number, body: string): string {
  return `Dialogue: 0,0:00:00.00,0:00:10.00,Card,,0,0,0,,{\\an${String(align)}\\pos(${String(Math.round(x))},${String(Math.round(y))})}${body}`;
}

function rule(x: number, y: number, width: number, thick: number, hex: string): string {
  const [x0, y0, x1, y1] = [x, y, x + width, y + thick].map((n) => String(Math.round(n)));
  return `Dialogue: 0,0:00:00.00,0:00:10.00,Card,,0,0,0,,{\\an7\\pos(0,0)\\p1\\bord0\\shad0\\c${colour(hex)}}m ${x0} ${y0} l ${x1} ${y0} l ${x1} ${y1} l ${x0} ${y1}{\\p0}`;
}

function script(input: CardInput, events: readonly string[]): string {
  const { width, height, style } = input;
  return `${[
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${String(width)}`,
    `PlayResY: ${String(height)}`,
    "WrapStyle: 2",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Card,${style.font.replace(/,/g, " ")},${String(Math.round(Math.min(width, height) * 0.03))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,0,0,7,0,0,0,1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...events,
  ].join("\n")}\n`;
}
