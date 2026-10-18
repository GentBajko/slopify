import type { DocumentSettings } from "../document/model.js";

// What the PDF worker (`pdf-worker.ts`) is asked to draw. Pictures travel as bytes; jsPDF
// never runs in the server's own thread.
export type PdfJob =
  | {
      readonly kind: "poster";
      // The finished piece at 300 dpi, filling one page of this size.
      readonly png: Uint8Array;
      readonly widthMm: number;
      readonly heightMm: number;
    }
  | {
      readonly kind: "brochure";
      readonly cover: Uint8Array;
      readonly title: string;
      readonly markdown: string;
      readonly settings: DocumentSettings;
      readonly writtenOn: string;
    };

export type PdfMaker = (job: PdfJob, signal: AbortSignal) => Promise<Uint8Array>;
