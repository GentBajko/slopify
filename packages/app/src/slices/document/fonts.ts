import { readFileSync } from "node:fs";
import type { jsPDF } from "jspdf";
import type { FontFace } from "./theme.js";

// The bundled Cinzel weights and Literata styles (SIL OFL 1.1, assets/document/fonts) and the
// page texture. Read on every render rather than kept in memory: eight fonts and one image
// are about a megabyte and a half, and a document is made once per article.
const assets = new URL("../../assets/document/", import.meta.url);
const cinzelFiles = {
  normal: "Cinzel-Regular.ttf",
  medium: "Cinzel-Medium.ttf",
  bold: "Cinzel-Bold.ttf",
  black: "Cinzel-Black.ttf",
} as const;
// Literata, a text face made for long reading on screens: its text optical size, at 400 and
// 600 for bold (a heavier bold crowds a page of body text).
const literataFiles = {
  normal: "Literata-Regular.ttf",
  bold: "Literata-SemiBold.ttf",
  italic: "Literata-Italic.ttf",
  bolditalic: "Literata-SemiBoldItalic.ttf",
} as const;

export interface DocumentAssets {
  readonly cinzel: Readonly<Record<keyof typeof cinzelFiles, string>>;
  readonly literata: Readonly<Record<keyof typeof literataFiles, string>>;
  readonly parchment: Uint8Array;
}

function readFonts<T extends Record<string, string>>(files: T): Record<keyof T, string> {
  return Object.fromEntries(
    Object.entries(files).map(([style, file]) => [
      style,
      readFileSync(new URL(`fonts/${file}`, assets)).toString("base64"),
    ]),
  ) as Record<keyof T, string>;
}

export function readDocumentAssets(): DocumentAssets {
  try {
    return {
      cinzel: readFonts(cinzelFiles),
      literata: readFonts(literataFiles),
      parchment: new Uint8Array(readFileSync(new URL("background.jpg", assets))),
    };
  } catch (error) {
    throw new Error(
      `Slopify couldn't read the fonts and page texture it makes documents with (${error instanceof Error ? error.message : String(error)}). Its installation is incomplete: reinstall or update Slopify, then use Try again on Document.`,
      { cause: error },
    );
  }
}

export function registerFonts(
  doc: jsPDF,
  fonts: Pick<DocumentAssets, "cinzel" | "literata">,
): void {
  for (const [style, file] of Object.entries(cinzelFiles)) {
    doc.addFileToVFS(file, fonts.cinzel[style as keyof typeof cinzelFiles]);
    doc.addFont(file, "Cinzel", style);
  }
  for (const [style, file] of Object.entries(literataFiles)) {
    doc.addFileToVFS(file, fonts.literata[style as keyof typeof literataFiles]);
    doc.addFont(file, "Literata", style);
  }
}

// Cinzel exists only in the four bundled weights; Literata and the standard fonts only in
// normal, bold, italic and bold italic. A face asking for anything else gets the nearest one.
export function useFace(doc: jsPDF, face: FontFace, size: number): void {
  doc.setFont(face.family, styleFor(face));
  doc.setFontSize(size);
  doc.setCharSpace(face.letterSpacing);
}

export function faceWidth(doc: jsPDF, face: FontFace, size: number, text: string): number {
  useFace(doc, face, size);
  return doc.getTextWidth(text) + face.letterSpacing * [...text].length;
}

function styleFor(face: FontFace): string {
  if (face.family === "Cinzel") {
    if (face.style === "italic") return "normal";
    if (face.style === "bolditalic") return "bold";
    return face.style;
  }
  if (face.style === "medium") return "normal";
  if (face.style === "black") return "bold";
  return face.style;
}
