import { jsPDF } from "jspdf";
import { type Block, type Run, runsText } from "./blocks.js";
import { drawLine, type TextStyle, wrapRuns } from "./flow.js";
import { type DocumentAssets, faceWidth, registerFonts, useFace } from "./fonts.js";
import {
  type ContentsEntry,
  type CoverImage,
  contentsPages,
  endPage,
  fillContents,
  headsAndFeet,
  sourcesPage,
  titlePage,
} from "./pages.js";
import { documentText } from "./sources.js";
import type { DocumentTheme } from "./theme.js";
import type { Writer } from "./writer.js";
import { createWriter } from "./writer.js";

// The article as a styled PDF: title page (with the thumbnail as its cover when there is
// one), table of contents, the body with drop caps after headings, the sources page and the
// theme's closing page. Ported from lore2script2's generator, which read plain text and
// guessed at headings; this one reads the article's markdown, so headings, emphasis, lists
// and links are what the article says they are.

export interface DocumentInput {
  readonly title: string;
  readonly articleMarkdown: string;
  readonly researchNotes: string | null;
  // A PNG, JPEG or WebP image; anything else is left off (`cover` in the result says so).
  readonly cover: Uint8Array | null;
  readonly theme: DocumentTheme;
  readonly writtenOn: Date;
  readonly assets: DocumentAssets;
}

export interface RenderedDocument {
  readonly bytes: Uint8Array;
  readonly pages: number;
  readonly words: number;
  readonly contents: readonly ContentsEntry[];
  readonly sources: number;
  readonly cover: "placed" | "none" | "unsupported";
}

export function renderDocument(input: DocumentInput): RenderedDocument {
  const { theme } = input;
  const text = documentText(input.articleMarkdown, input.researchNotes);
  const blocks = withoutTitle(text.blocks, input.title);
  if (blocks.length === 0)
    throw new Error(
      "The article has no text to put in the document. Write or regenerate the article (Edit project → Article), then use Retry stage on Document.",
    );
  const words = blocks
    .map((block) =>
      block.kind === "heading" ? block.text : "runs" in block ? runsText(block.runs) : "",
    )
    .join(" ")
    .split(/\s+/)
    .filter((word) => word !== "").length;
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: theme.page.format,
    compress: true,
  });
  registerFonts(doc, input.assets.cinzel);
  const fill = (template: string): string => template.replaceAll("{title}", input.title).trim();
  doc.setProperties({
    title: input.title,
    author: fill(theme.metadata.author),
    subject: fill(theme.metadata.subject),
    keywords: fill(theme.metadata.keywords),
    creator: fill(theme.metadata.creator),
  });
  const w = createWriter(doc, theme, input.assets);
  const cover = coverImage(input.cover);
  titlePage(w, input.title, words, input.writtenOn, cover === "unsupported" ? null : cover);

  const listed = blocks.filter(
    (block) => block.kind === "heading" && block.level <= theme.contents.depth,
  ).length;
  const extra =
    (theme.sources.enabled && text.sources.length > 0 ? 1 : 0) + (theme.endPage.enabled ? 1 : 0);
  const reserved = contentsPages(w, listed + extra);
  for (let page = 0; page < reserved; page += 1) w.addPage();

  w.addPage();
  const contents: ContentsEntry[] = [];
  writeBody(w, blocks, contents);
  // The sources and closing pages line up with the article's outermost headings.
  const level = Math.min(3, ...contents.map((entry) => entry.level));
  for (const page of [sourcesPage(w, text.sources), endPage(w, words, input.writtenOn)])
    if (page !== null) contents.push({ ...page, level });
  if (reserved > 0) fillContents(w, 2, contents);
  headsAndFeet(w, input.title);
  return {
    bytes: new Uint8Array(doc.output("arraybuffer")),
    pages: doc.getNumberOfPages(),
    words,
    contents,
    sources: text.sources.length,
    cover: cover === null ? "none" : cover === "unsupported" ? "unsupported" : "placed",
  };
}

// The title page already carries the title, so an article that opens by repeating it
// starts with its first real section instead.
function withoutTitle(blocks: readonly Block[], title: string): readonly Block[] {
  const at = blocks
    .slice(0, 3)
    .findIndex(
      (block) =>
        block.kind === "heading" && block.text.trim().toLowerCase() === title.trim().toLowerCase(),
    );
  return at === -1 ? blocks : blocks.filter((_, index) => index !== at);
}

function coverImage(data: Uint8Array | null): CoverImage | "unsupported" | null {
  if (data === null) return null;
  const bytes = (...values: number[]): boolean =>
    values.every((value, index) => data[index] === value);
  if (bytes(0x89, 0x50, 0x4e, 0x47)) return { data, format: "PNG" };
  if (bytes(0xff, 0xd8, 0xff)) return { data, format: "JPEG" };
  if (bytes(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...data.subarray(8, 12)) === "WEBP")
    return { data, format: "WEBP" };
  return "unsupported";
}

function writeBody(w: Writer, blocks: readonly Block[], contents: ContentsEntry[]): void {
  const { theme } = w;
  const line = theme.spacing.bodyLine;
  const style: TextStyle = {
    size: theme.sizes.body,
    body: theme.fonts.body,
    strong: theme.fonts.strong,
    emphasis: theme.fonts.emphasis,
    color: w.colors.text,
    linkColor: w.colors.heading,
  };
  let afterHeading = false;
  for (const [index, block] of blocks.entries()) {
    if (block.kind === "heading") {
      // A heading keeps the start of what follows it on its page: two lines, or all the
      // room a drop-capped paragraph asks for, so the heading is never left at the foot.
      const next = blocks[index + 1];
      const keep =
        next?.kind === "paragraph" && dropCapLetter(theme, next.runs) !== null
          ? dropCapRoom(w)
          : theme.spacing.bodyLine * 2;
      const entry = writeHeading(w, block, keep);
      if (block.level <= theme.contents.depth) contents.push(entry);
      afterHeading = true;
      continue;
    }
    if (block.kind === "rule") {
      w.ensure(line);
      const rgb = w.colors.muted;
      w.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
      w.doc.setLineWidth(0.3);
      const half = theme.spacing.ruleWidth / 2;
      w.doc.line(w.width / 2 - half, w.y - line / 3, w.width / 2 + half, w.y - line / 3);
      w.y += line;
      continue;
    }
    if (block.kind === "paragraph") {
      const cap = afterHeading ? dropCapLetter(theme, block.runs) : null;
      if (cap === null) writeLines(w, block.runs, style, 0, w.contentWidth);
      else writeDropCap(w, block.runs, style, cap);
      w.y += line * theme.spacing.paragraphGap;
    } else if (block.kind === "item") {
      const indent = block.depth * theme.spacing.listIndent;
      w.ensure(line);
      if (block.marker !== "")
        w.write(block.marker, w.left + indent, w.y, theme.fonts.body, theme.sizes.body, "muted");
      const text = indent + theme.spacing.listIndent;
      writeLines(w, block.runs, style, text, w.contentWidth - text);
      w.y += line * theme.spacing.itemGap;
    } else {
      const indent = theme.spacing.quoteIndent;
      const quote = { ...style, color: w.colors.muted };
      const start = { page: w.page(), y: w.y };
      writeLines(w, block.runs, quote, indent, w.contentWidth - indent * 2);
      if (w.page() === start.page) {
        const rgb = w.colors.heading;
        w.doc.setDrawColor(rgb.r, rgb.g, rgb.b);
        w.doc.setLineWidth(0.6);
        const x = w.left + indent / 2;
        w.doc.line(x, start.y - line * 0.6, x, w.y - line * 0.8);
      }
      w.y += line * theme.spacing.paragraphGap;
    }
    afterHeading = false;
  }
}

function writeLines(
  w: Writer,
  runs: readonly Run[],
  style: TextStyle,
  indent: number,
  width: number,
): void {
  const lines = wrapRuns(w.doc, runs, style, () => ({ indent, width }));
  for (const one of lines) {
    w.ensure(w.theme.spacing.bodyLine);
    drawLine(w.doc, one, w.left, w.y, style.size);
    w.y += w.theme.spacing.bodyLine;
  }
}

const chapterHeading = /^(Chapter|Section|Part)\s+(\d+):?\s*([\s\S]*)$/i;

// Level 1 and 2 are centred in the heading face at the section and heading sizes; a
// "Chapter 3: Title – Subtitle" heading shows its number large with each part of the title
// under it. Level 3 sits on the left, smaller.
function writeHeading(
  w: Writer,
  block: Block & { readonly kind: "heading" },
  keep: number,
): ContentsEntry {
  const { theme, doc } = w;
  const { fonts, sizes, spacing } = theme;
  if (w.y > theme.page.contentTop) w.y += spacing.bodyLine * spacing.headingGap;
  const sub = block.level === 3;
  const size = block.level === 1 ? sizes.section : sub ? sizes.subheading : sizes.heading;
  const lineHeight = sub ? spacing.subheadingLine : spacing.headingLine;
  const chapter = sub ? null : chapterHeading.exec(block.text);
  const parts =
    chapter === null
      ? [block.text]
      : (chapter[3] ?? "")
          .split(/\s+[–—]\s+/)
          .map((part) => part.trim())
          .filter((part) => part !== "");
  useFace(doc, fonts.heading, size);
  const lines = parts.flatMap(
    (part) => doc.splitTextToSize(part, w.contentWidth - (chapter === null ? 0 : 20)) as string[],
  );
  // The heading and the first lines under it stay on one page.
  const height = lines.length * lineHeight + (chapter === null ? 0 : lineHeight * 1.5);
  w.ensure(height + spacing.bodyLine * spacing.paragraphGap + keep);
  const entry = { title: block.text, level: block.level, page: w.page() };
  if (chapter !== null) {
    w.write(chapter[2] ?? "", w.width / 2, w.y, fonts.dramatic, sizes.section, "heading", "center");
    w.y += lineHeight * 1.5;
  }
  for (const text of lines) {
    if (sub) w.write(text, w.left, w.y, fonts.heading, size, "heading");
    else w.write(text, w.width / 2, w.y, fonts.heading, size, "heading", "center");
    w.y += lineHeight;
  }
  w.y += spacing.bodyLine * spacing.paragraphGap;
  return entry;
}

function dropCapLetter(theme: DocumentTheme, runs: readonly Run[]): string | null {
  const first = runs[0];
  if (!theme.dropCap.enabled || first === undefined || first.href !== null) return null;
  if (runsText(runs).length < theme.dropCap.minLength) return null;
  const letter = [...first.text][0] ?? "";
  return /\p{L}/u.test(letter) ? letter : null;
}

// The first letter set large across `lines` body lines, the text beside it narrowed, then
// full width below it.
function writeDropCap(w: Writer, runs: readonly Run[], style: TextStyle, letter: string): void {
  const { theme, doc } = w;
  const { dropCap } = theme;
  const line = theme.spacing.bodyLine;
  w.ensure(dropCapRoom(w));
  const size = line * dropCap.lines * dropCap.scale;
  const capital = letter.toUpperCase();
  const capWidth = faceWidth(doc, theme.fonts.dropCap, size, capital) + dropCap.gap;
  w.write(capital, w.left, w.y + line * (dropCap.lines - 1), theme.fonts.dropCap, size, "heading");
  const [first, ...rest] = runs;
  const remaining: readonly Run[] =
    first === undefined ? [] : [{ ...first, text: [...first.text].slice(1).join("") }, ...rest];
  const top = w.y;
  const lines = wrapRuns(doc, remaining, style, (index) =>
    index < dropCap.lines
      ? { indent: capWidth, width: w.contentWidth - capWidth }
      : { indent: 0, width: w.contentWidth },
  );
  for (const [index, one] of lines.entries()) {
    if (index >= dropCap.lines) w.ensure(line);
    drawLine(doc, one, w.left, w.y, style.size);
    w.y += line;
  }
  // Text shorter than the initial still leaves its full height free.
  w.y = Math.max(w.y, top + line * dropCap.lines);
}

// The room a drop-capped paragraph needs left on the page: the theme's share of it, and at
// least the initial itself, which reaches about `lines * scale` body lines below its first
// baseline.
function dropCapRoom(w: Writer): number {
  const { theme } = w;
  const { dropCap } = theme;
  const usable =
    w.height - theme.page.margin - theme.header.top - theme.footer.bottom - theme.footer.reserve;
  return Math.max(usable * dropCap.minRoom, theme.spacing.bodyLine * dropCap.lines * dropCap.scale);
}
