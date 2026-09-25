import type { jsPDF } from "jspdf";
import type { Run } from "./blocks.js";
import { faceWidth, useFace } from "./fonts.js";
import type { FontFace, RGB } from "./theme.js";

// Wraps a paragraph's styled runs into lines. jsPDF only splits plain text, so words are
// measured one at a time in their own face and placed left to right; a word too long for
// a line on its own (a bare URL, say) is broken between letters.

export interface TextStyle {
  readonly size: number;
  readonly body: FontFace;
  readonly strong: FontFace;
  readonly emphasis: FontFace;
  readonly color: RGB;
  readonly linkColor: RGB;
}

export interface Piece {
  readonly text: string;
  readonly face: FontFace;
  readonly color: RGB;
  readonly href: string | null;
  readonly x: number;
  readonly width: number;
}

export type Line = readonly Piece[];

interface Atom {
  readonly text: string;
  readonly run: Run;
  readonly width: number;
}

type Token =
  | { readonly kind: "word"; readonly atoms: readonly Atom[]; readonly space: boolean }
  | { readonly kind: "break" };

// `room(index)` answers where line `index` starts, relative to the paragraph's left edge,
// and how wide it may be: a drop cap narrows the first few.
export function wrapRuns(
  doc: jsPDF,
  runs: readonly Run[],
  style: TextStyle,
  room: (index: number) => { readonly indent: number; readonly width: number },
): readonly Line[] {
  const spaceWidth = faceWidth(doc, style.body, style.size, " ");
  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let x = 0;
  const limit = (): { indent: number; width: number } => room(lines.length);
  const finish = (): void => {
    lines.push(line);
    line = [];
    x = 0;
  };
  const place = (atom: Atom): void => {
    const { indent } = limit();
    line.push({
      text: atom.text,
      face: faceOf(atom.run, style),
      color: atom.run.href === null ? style.color : style.linkColor,
      href: atom.run.href,
      x: indent + x,
      width: atom.width,
    });
    x += atom.width;
  };
  for (const token of tokens(doc, runs, style)) {
    if (token.kind === "break") {
      finish();
      continue;
    }
    const width = token.atoms.reduce((sum, atom) => sum + atom.width, 0);
    const gap = line.length > 0 && token.space ? spaceWidth : 0;
    if (line.length > 0 && x + gap + width > limit().width) finish();
    else x += gap;
    if (width <= limit().width) {
      for (const atom of token.atoms) place(atom);
      continue;
    }
    for (const atom of token.atoms)
      for (const character of [...atom.text]) {
        const piece = { ...atom, text: character, width: measure(doc, atom.run, style, character) };
        if (line.length > 0 && x + piece.width > limit().width) finish();
        place(piece);
      }
  }
  if (line.length > 0) finish();
  return lines;
}

export function drawLine(doc: jsPDF, line: Line, left: number, y: number, size: number): void {
  for (const piece of line) {
    useFace(doc, piece.face, size);
    doc.setTextColor(piece.color.r, piece.color.g, piece.color.b);
    doc.text(piece.text, left + piece.x, y);
  }
  // One clickable box per run of pieces sharing a link, rather than one per word.
  let start: Piece | undefined;
  let end: Piece | undefined;
  const flush = (): void => {
    if (start?.href != null && end !== undefined)
      doc.link(left + start.x, y - size * 0.3528, end.x + end.width - start.x, size * 0.45, {
        url: start.href,
      });
    start = undefined;
    end = undefined;
  };
  for (const piece of line) {
    if (piece.href !== start?.href) flush();
    if (piece.href !== null) {
      start ??= piece;
      end = piece;
    }
  }
  flush();
  doc.setCharSpace(0);
}

function tokens(doc: jsPDF, runs: readonly Run[], style: TextStyle): readonly Token[] {
  const result: Token[] = [];
  let space = false;
  for (const run of runs) {
    for (const part of run.text.split(/( +|\n)/)) {
      if (part === "") continue;
      if (part === "\n") {
        result.push({ kind: "break" });
        space = false;
        continue;
      }
      if (/^ +$/.test(part)) {
        space = true;
        continue;
      }
      const atom = { text: part, run, width: measure(doc, run, style, part) };
      const last = result.at(-1);
      // No space before this part: it continues the previous word, as the comma after a
      // bold word does, and must not be wrapped away from it.
      if (!space && last?.kind === "word")
        result[result.length - 1] = { ...last, atoms: [...last.atoms, atom] };
      else result.push({ kind: "word", atoms: [atom], space });
      space = false;
    }
  }
  return result;
}

function measure(doc: jsPDF, run: Run, style: TextStyle, text: string): number {
  return faceWidth(doc, faceOf(run, style), style.size, text);
}

function faceOf(run: Run, style: TextStyle): FontFace {
  return run.strong ? style.strong : run.emphasis ? style.emphasis : style.body;
}
