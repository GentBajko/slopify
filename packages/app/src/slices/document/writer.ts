import type { jsPDF } from "jspdf";
import type { DocumentAssets } from "./fonts.js";
import { useFace } from "./fonts.js";
import { type DocumentTheme, type FontFace, parseHexColor, type RGB } from "./theme.js";

export type ColorName = keyof DocumentTheme["colors"];

// The page being written and where on it. Only the renderer holds one; everything else it
// calls draws through it so page breaks, backgrounds and colours are decided in one place.
export interface Writer {
  readonly doc: jsPDF;
  readonly theme: DocumentTheme;
  readonly colors: Readonly<Record<ColorName, RGB>>;
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly contentWidth: number;
  // Lowest baseline body text may sit on above the footer.
  readonly bottom: number;
  // Baseline of the next line on the current page.
  y: number;
  addPage(): void;
  // Starts a new page unless `height` more fits on this one.
  ensure(height: number): void;
  page(): number;
  write(
    text: string,
    x: number,
    y: number,
    face: FontFace,
    size: number,
    color: ColorName,
    align?: "left" | "center" | "right",
  ): void;
}

export function createWriter(doc: jsPDF, theme: DocumentTheme, assets: DocumentAssets): Writer {
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const colors = {
    heading: parseHexColor(theme.colors.heading),
    text: parseHexColor(theme.colors.text),
    muted: parseHexColor(theme.colors.muted),
    faint: parseHexColor(theme.colors.faint),
  };
  const writer: Writer = {
    doc,
    theme,
    colors,
    width,
    height,
    left: theme.page.margin,
    contentWidth: width - theme.page.margin * 2,
    bottom: height - theme.footer.bottom - theme.footer.reserve,
    y: theme.page.contentTop,
    addPage() {
      doc.addPage();
      paintBackground(doc, theme, assets, width, height);
      writer.y = theme.page.contentTop;
    },
    ensure(needed) {
      if (writer.y + needed > writer.bottom) writer.addPage();
    },
    page() {
      return doc.getCurrentPageInfo().pageNumber;
    },
    write(text, x, y, face, size, color, align = "left") {
      useFace(doc, face, size);
      const rgb = colors[color];
      doc.setTextColor(rgb.r, rgb.g, rgb.b);
      doc.text(text, x, y, align === "left" ? {} : { align });
      doc.setCharSpace(0);
    },
  };
  paintBackground(doc, theme, assets, width, height);
  return writer;
}

// The texture when the theme has one, otherwise the flat colour with slightly darker edges.
function paintBackground(
  doc: jsPDF,
  theme: DocumentTheme,
  assets: DocumentAssets,
  width: number,
  height: number,
): void {
  if (theme.background.image === "parchment") {
    // The alias embeds the image once and points every page at it.
    doc.addImage(assets.parchment, "JPEG", 0, 0, width, height, "parchment");
    return;
  }
  const base = parseHexColor(theme.background.color);
  doc.setFillColor(base.r, base.g, base.b);
  doc.rect(0, 0, width, height, "F");
  const steps = 4;
  const thickness = 2;
  for (let step = 0; step < steps; step += 1) {
    const inset = step * 2;
    const shade = (channel: number): number =>
      Math.max(0, Math.round(channel - 15 * (1 - step / steps)));
    doc.setFillColor(shade(base.r), shade(base.g), shade(base.b));
    doc.rect(inset, inset, width - 2 * inset, thickness, "F");
    doc.rect(inset, height - inset - thickness, width - 2 * inset, thickness, "F");
    doc.rect(inset, inset, thickness, height - 2 * inset, "F");
    doc.rect(width - inset - thickness, inset, thickness, height - 2 * inset, "F");
  }
}
