import { render } from "../admission/substitute.js";
import { mappedCodepoints } from "../fonts/sfnt.js";
import type { TextLayout } from "./layout.js";
import type { DesignText } from "./schema.js";

// Before a piece is drawn: every letter of every block is in its font (else libass would draw
// an empty box or swap in another font), and every block's text is in the script exactly as
// typed. Pure; the caller reads the font files.

export interface CheckFont {
  readonly name: string;
  readonly bytes: Uint8Array;
  readonly faceIndex: number;
}

export interface TextProblem {
  readonly blockId: string;
  readonly sentence: string;
}

const squash = (value: string): string => value.replace(/\s+/g, "");

export function checkText(input: {
  readonly text: DesignText;
  readonly values: Readonly<Record<string, string>>;
  readonly layout: TextLayout;
  readonly fonts: Readonly<Record<string, CheckFont>>;
  readonly formatLabel: string;
}): readonly TextProblem[] {
  const problems: TextProblem[] = [];
  for (const [index, block] of input.text.blocks.entries()) {
    const filled = render(block.text, input.values);
    if (filled.trim() === "") continue;
    const where = `text block ${String(index + 1)}`;
    const font = input.fonts[block.fontId];
    if (font === undefined) {
      problems.push({
        blockId: block.id,
        sentence: `The font chosen for ${where} is no longer on this computer. Choose another font for it under Text.`,
      });
      continue;
    }
    const letters = [...new Set([...filled].filter((ch) => ch.trim() !== ""))];
    const found = mappedCodepoints(
      font.bytes,
      font.faceIndex,
      letters.map((ch) => ch.codePointAt(0) ?? 0),
    );
    const missing =
      found === undefined ? [] : letters.filter((ch) => !found.has(ch.codePointAt(0) ?? 0));
    if (missing.length > 0)
      problems.push({
        blockId: block.id,
        sentence: `The font ${font.name} has no ${missing.map((ch) => `“${ch}”`).join(" ")} for ${where}. Choose another font for it under Text, or upload one that has ${missing.length === 1 ? "it" : "them"}.`,
      });
    const drawn = input.layout.lines
      .filter((line) => line.blockId === block.id)
      .map((line) => line.text)
      .join("");
    if (squash(drawn) !== squash(filled))
      problems.push({
        blockId: block.id,
        sentence: `Slopify couldn't place ${where} exactly as typed on ${input.formatLabel}. Shorten it under Text, then press Make again.`,
      });
  }
  if (input.layout.overflow)
    problems.push({
      blockId: "",
      sentence: `The text doesn't fit on ${input.formatLabel}, even at the smallest readable size. Shorten it or choose a placement with more room under Text.`,
    });
  return problems;
}
