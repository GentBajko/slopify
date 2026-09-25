import { useFace } from "./fonts.js";
import type { SourceItem } from "./sources.js";
import type { Writer } from "./writer.js";

export interface ContentsEntry {
  readonly title: string;
  readonly level: number;
  readonly page: number;
}

export interface CoverImage {
  readonly data: Uint8Array;
  readonly format: "PNG" | "JPEG" | "WEBP";
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

export function writtenOn(date: Date): string {
  return dateFormat.format(date);
}

// Brand, tagline, title, the cover when there is one, then the date, word count and link.
export function titlePage(
  w: Writer,
  title: string,
  words: number,
  date: Date,
  cover: CoverImage | null,
): void {
  const { theme, doc } = w;
  const { fonts, sizes, titlePage: layout, brand } = theme;
  const centre = w.width / 2;
  if (brand.name !== null) {
    w.write(brand.name, centre, layout.brandY, fonts.dramatic, sizes.brand, "heading", "center");
    if (brand.url !== null) {
      const width = doc.getTextWidth(brand.name);
      doc.link(centre - width / 2, layout.brandY - 8, width, 10, { url: brand.url });
    }
  }
  if (brand.tagline !== null)
    w.write(
      brand.tagline,
      centre,
      layout.brandY + layout.taglineOffset,
      fonts.decorative,
      sizes.body,
      "heading",
      "center",
    );
  useFace(doc, fonts.heading, sizes.title);
  let y = layout.titleY;
  for (const line of doc.splitTextToSize(title, w.contentWidth) as string[]) {
    w.write(line, centre, y, fonts.heading, sizes.title, "text", "center");
    y += layout.titleLine;
  }
  // Without a cover the details sit where lore2script2 put them; with one, just under it.
  let meta = y + layout.metaOffset;
  if (cover !== null && layout.cover.enabled) {
    const top = y - layout.titleLine + layout.cover.gap;
    const below = layout.cover.gap + layout.metaLine * 3;
    const room = Math.min(layout.cover.maxHeight, w.bottom - below - top);
    const { width, height } = doc.getImageProperties(cover.data);
    if (room > 0 && width > 0 && height > 0) {
      const scale = Math.min(w.contentWidth / width, room / height);
      doc.addImage(
        cover.data,
        cover.format,
        centre - (width * scale) / 2,
        top,
        width * scale,
        height * scale,
      );
      meta = top + height * scale + layout.cover.gap + layout.metaLine;
    }
  }
  const line = (text: string, color: "muted" | "heading", decorative = false): void => {
    w.write(
      text,
      centre,
      meta,
      decorative ? fonts.decorative : fonts.body,
      sizes.meta,
      color,
      "center",
    );
    meta += layout.metaLine;
  };
  if (layout.showDate) line(`Written on ${writtenOn(date)}`, "muted");
  if (layout.showWordCount) line(`Word Count: ${words.toLocaleString("en-US")}`, "muted");
  if (brand.linkLabel !== null) {
    const at = meta;
    line(brand.linkLabel, "heading", true);
    if (brand.url !== null) {
      const width = doc.getTextWidth(brand.linkLabel);
      doc.link(centre - width / 2, at - 8, width, 10, { url: brand.url });
    }
  }
}

// How many pages the contents need for `entries` one-line entries, laid out exactly as
// fillContents lays them out, so they can be kept free before the body is written.
export function contentsPages(w: Writer, entries: number): number {
  const { contents } = w.theme;
  if (!contents.enabled || entries === 0) return 0;
  let pages = 1;
  let y = w.left + contents.firstEntryOffset;
  for (let entry = 0; entry < entries; entry += 1) {
    if (y + contents.line > w.bottom) {
      pages += 1;
      y = w.theme.header.top + contents.titleOffset;
    }
    y += contents.line;
  }
  return pages;
}

export function fillContents(w: Writer, first: number, entries: readonly ContentsEntry[]): void {
  const { doc, theme } = w;
  const { contents, fonts, sizes } = theme;
  if (!contents.enabled || entries.length === 0) return;
  let page = first;
  doc.setPage(page);
  w.write(
    contents.title,
    w.width / 2,
    w.left + contents.titleOffset,
    fonts.heading,
    sizes.section,
    "heading",
    "center",
  );
  const top = Math.min(...entries.map((entry) => entry.level));
  let y = w.left + contents.firstEntryOffset;
  for (const entry of entries) {
    if (y + contents.line > w.bottom) {
      page += 1;
      doc.setPage(page);
      y = theme.header.top + contents.titleOffset;
    }
    const indent = (entry.level - top) * contents.indent;
    const number = String(entry.page);
    useFace(doc, fonts.body, sizes.body);
    const numberX = w.width - w.left - doc.getTextWidth(number);
    const room = numberX - (w.left + indent) - 10;
    let label = entry.title;
    if (doc.getTextWidth(label) > room) {
      while (label.length > 1 && doc.getTextWidth(`${label}...`) > room) label = label.slice(0, -1);
      label = `${label.trimEnd()}...`;
    }
    w.write(label, w.left + indent, y, fonts.body, sizes.body, "text");
    const labelEnd = w.left + indent + doc.getTextWidth(label) + 3;
    w.write(number, numberX, y, fonts.body, sizes.body, "text");
    doc.link(w.left, y - 6, w.contentWidth, 8, { pageNumber: entry.page });
    const dot = doc.getTextWidth(".") * 1.5;
    for (let x = labelEnd; x + dot < numberX - 3; x += dot)
      w.write(".", x, y, fonts.body, sizes.body, "muted");
    y += contents.line;
  }
}

export function sourcesPage(w: Writer, items: readonly SourceItem[]): ContentsEntry | null {
  const { doc, theme } = w;
  const { fonts, sizes, sources } = theme;
  if (!sources.enabled || items.length === 0) return null;
  w.addPage();
  w.write(
    sources.title,
    w.left,
    w.left + sources.titleOffset,
    fonts.heading,
    sizes.section,
    "heading",
  );
  const entry = { title: sources.title, level: 1, page: w.page() };
  w.y = w.left + sources.bodyOffset;
  useFace(doc, fonts.body, sizes.body);
  const bullet = doc.getTextWidth("• ");
  for (const item of items) {
    useFace(doc, fonts.body, sizes.body);
    const lines = doc.splitTextToSize(item.text, w.contentWidth - bullet - 5) as string[];
    w.ensure(sources.line);
    w.write("•", w.left, w.y, fonts.body, sizes.body, "muted");
    for (const line of lines) {
      w.ensure(sources.line);
      w.write(
        line,
        w.left + bullet,
        w.y,
        fonts.body,
        sizes.body,
        item.href === null ? "text" : "heading",
      );
      if (item.href !== null)
        doc.link(w.left + bullet, w.y - 5, doc.getTextWidth(line), 7, { url: item.href });
      w.y += sources.line;
    }
    w.y += sources.gap;
  }
  return entry;
}

// The closing page: the theme's lines, then the document's details and the call to action.
export function endPage(w: Writer, words: number, date: Date): ContentsEntry | null {
  const { doc, theme } = w;
  const { fonts, sizes, endPage: end } = theme;
  if (!end.enabled) return null;
  w.addPage();
  w.write(end.title, w.left, w.left + end.titleOffset, fonts.heading, sizes.section, "heading");
  const entry = { title: end.title, level: 1, page: w.page() };
  const lines = [...end.lines];
  if (end.showDocumentDetails) {
    if (lines.length > 0) lines.push("");
    lines.push(
      "Document Details:",
      `• Written On: ${writtenOn(date)}`,
      `• Total Words: ${words.toLocaleString("en-US")}`,
      `• Total Pages: ${doc.getNumberOfPages()}`,
    );
  }
  const line = theme.spacing.bodyLine;
  let y = w.left + end.bodyOffset;
  for (const text of lines) {
    if (text.startsWith("•")) w.write(text, w.left + 5, y, fonts.body, sizes.body, "muted");
    else if (text.endsWith(":")) w.write(text, w.left, y, fonts.strong, sizes.body, "text");
    else if (text !== "") w.write(text, w.left, y, fonts.body, sizes.body, "text");
    y += line;
  }
  const calls = [end.link?.text, end.closing].filter((text): text is string => Boolean(text));
  if (calls.length > 0) y += line;
  for (const text of calls) {
    w.write(text, w.left, y, fonts.decorative, sizes.body, "heading");
    if (text === end.link?.text && end.link.url !== null)
      doc.link(w.left, y - 6, doc.getTextWidth(text), 8, { url: end.link.url });
    y += line;
  }
  return entry;
}

// The running header ("Brand | Title") and page number on every page after the title page.
export function headsAndFeet(w: Writer, title: string): void {
  const { doc, theme } = w;
  const { fonts, sizes, header, footer, brand } = theme;
  for (let page = 2; page <= doc.getNumberOfPages(); page += 1) {
    doc.setPage(page);
    if (header.enabled) {
      useFace(doc, fonts.body, sizes.footer);
      const shown =
        doc.getTextWidth(title) > w.contentWidth - 40
          ? `${title.slice(0, header.maxTitleCharacters)}...`
          : title;
      const text = [brand.name, shown].filter(Boolean).join(" | ");
      if (text !== "") w.write(text, w.left, header.top, fonts.body, sizes.footer, "faint");
      if (brand.name !== null && brand.url !== null)
        doc.link(w.left, header.top - 6, doc.getTextWidth(brand.name), 8, { url: brand.url });
    }
    if (footer.enabled)
      w.write(
        footer.text.replaceAll("{page}", String(page)),
        w.width / 2,
        w.height - footer.bottom,
        fonts.footer,
        sizes.footer,
        "faint",
        "center",
      );
  }
}
