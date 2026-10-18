import { errorText } from "../../kernel/errors.js";
import { readDocumentAssets } from "../document/fonts.js";
import { type PdfWorkerMessage, pdfJobSchema } from "./pdf-job.js";
import { brochurePdf, posterPdf } from "./pdf-pages.js";

// The forked process a design's PDF is drawn in (`pdf-runner.ts`): one job in, its bytes or
// what went wrong out, then it exits.

function answer(message: PdfWorkerMessage): void {
  process.send?.(message, () => process.exit(0));
}

process.once("message", (raw: unknown) => {
  const parsed = pdfJobSchema.safeParse(raw);
  if (!parsed.success) {
    answer({ type: "error", message: "The PDF worker was sent a job it can't read." });
    return;
  }
  try {
    const job = parsed.data;
    const bytes =
      job.kind === "poster" ? posterPdf(job) : brochurePdf(job, readDocumentAssets()).bytes;
    answer({ type: "done", bytes });
  } catch (error) {
    answer({ type: "error", message: errorText(error).slice(0, 4000) });
  }
});
