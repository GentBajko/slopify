import { z } from "zod";
import type { DocumentSettings } from "../document/model.js";
import { documentSettingsSchema } from "../document/theme-schema.js";

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

const bytes = z.custom<Uint8Array>((value) => value instanceof Uint8Array);
const millimetres = z.number().positive().max(2000);

export const pdfJobSchema = z.discriminatedUnion("kind", [
  z
    .object({ kind: z.literal("poster"), png: bytes, widthMm: millimetres, heightMm: millimetres })
    .strict(),
  z
    .object({
      kind: z.literal("brochure"),
      cover: bytes,
      title: z.string().min(1).max(200),
      markdown: z.string().min(1).max(100_000),
      settings: documentSettingsSchema,
      writtenOn: z.string(),
    })
    .strict(),
]);

export const pdfWorkerMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("done"), bytes }).strict(),
  z.object({ type: z.literal("error"), message: z.string().max(4000) }).strict(),
]);
export type PdfWorkerMessage = z.infer<typeof pdfWorkerMessage>;
