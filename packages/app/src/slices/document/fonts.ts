import { readFileSync } from "node:fs";
import type { jsPDF } from "jspdf";
import type { FontFace } from "./theme.js";

// The bundled Cinzel weights (SIL OFL 1.1, assets/document/fonts/OFL.txt) and the page
// texture. Read on every render rather than kept in memory: four fonts and one image are
// under a megabyte, and a document is made once per article.
const assets = new URL("../../assets/document/", import.meta.url);
const cinzelFiles = {
  normal: "Cinzel-Regular.ttf",
  medium: "Cinzel-Medium.ttf",
  bold: "Cinzel-Bold.ttf",
  black: "Cinzel-Black.ttf",
} as const;

export interface DocumentAssets {
  readonly cinzel: Readonly<Record<keyof typeof cinzelFiles, string>>;
  readonly parchment: Uint8Array;
}

export function readDocumentAssets(): DocumentAssets {
  try {
    const cinzel = Object.fromEntries(
      Object.entries(cinzelFiles).map(([style, file]) => [
        style,
        readFileSync(new URL(`fonts/${file}`, assets)).toString("base64"),
      ]),
    ) as Record<keyof typeof cinzelFiles, string>;
    return { cinzel, parchment: new Uint8Array(readFileSync(new URL("background.jpg", assets))) };
  } catch (error) {
    throw new Error(
      `Slopify couldn't read the fonts and page texture it makes documents with (${error instanceof Error ? error.message : String(error)}). Its installation is incomplete: reinstall or update Slopify, then use Retry stage on Document.`,
      { cause: error },
    );
  }
}

export function registerFonts(doc: jsPDF, fonts: DocumentAssets["cinzel"]): void {
  for (const [style, file] of Object.entries(cinzelFiles)) {
    doc.addFileToVFS(file, fonts[style as keyof typeof cinzelFiles]);
    doc.addFont(file, "Cinzel", style);
  }
}

// Cinzel exists only in the four bundled weights; the standard fonts only in normal, bold,
// italic and bold italic. A face asking for anything else gets the nearest one.
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
