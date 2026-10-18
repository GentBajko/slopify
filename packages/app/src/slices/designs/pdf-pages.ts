import { jsPDF } from "jspdf";
import type { DocumentAssets } from "../document/fonts.js";
import { renderDocument } from "../document/render.js";
import { resolvedDocumentTheme } from "../document/theme.js";
import type { PdfJob } from "./pdf-job.js";

// The PDFs themselves, drawn by jsPDF. Called only inside the PDF worker (`pdf-worker.ts`):
// jsPDF is synchronous and a print page is large, so the server never runs it in its thread.

// One page of the given size, the drawn piece filling it edge to edge. No bleed or crop
// marks: the PNG is already 300 dpi of the page.
export function posterPdf(job: Extract<PdfJob, { kind: "poster" }>): Uint8Array {
  const doc = new jsPDF({
    orientation: job.widthMm > job.heightMm ? "landscape" : "portrait",
    unit: "mm",
    format: [job.widthMm, job.heightMm],
    compress: true,
  });
  doc.addImage(job.png, "PNG", 0, 0, job.widthMm, job.heightMm, undefined, "FAST");
  return new Uint8Array(doc.output("arraybuffer"));
}

// The theme's document: the designed cover on its title page, then the brochure's pages.
export function brochurePdf(
  job: Extract<PdfJob, { kind: "brochure" }>,
  assets: DocumentAssets,
): { readonly bytes: Uint8Array; readonly pages: number; readonly cover: string } {
  const rendered = renderDocument({
    title: job.title,
    articleMarkdown: job.markdown,
    researchNotes: null,
    cover: job.cover,
    theme: resolvedDocumentTheme(job.settings),
    writtenOn: new Date(job.writtenOn),
    assets,
  });
  return { bytes: rendered.bytes, pages: rendered.pages, cover: rendered.cover };
}
