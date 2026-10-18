import { type ForkOptions, fork } from "node:child_process";
import { type PdfJob, pdfWorkerMessage } from "./pdf-job.js";

// Draws one design PDF in a forked worker, so jsPDF's synchronous work never holds up the
// server. Bytes travel both ways over IPC with structured-clone serialization; a cancel kills
// the worker outright. The worker's address is injectable for tests.

export const pdfWorkerTimeoutMs = 5 * 60_000;

export function runPdfWorker(
  job: PdfJob,
  signal: AbortSignal,
  worker: URL = new URL("./pdf-worker.js", import.meta.url),
  timeoutMs = pdfWorkerTimeoutMs,
): Promise<Uint8Array> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const options: ForkOptions & { readonly windowsHide: boolean } = {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      windowsHide: true,
      execArgv: [],
      serialization: "advanced",
    };
    const child = fork(worker, [], options);
    let finishing = false;
    let failure: Error | undefined;
    let output: Uint8Array = new Uint8Array();
    let stderr = "";
    const timer = setTimeout(
      () =>
        finish(
          new Error(
            "Making the PDF took longer than 5 minutes, so it was stopped. Press Download PDF again.",
          ),
        ),
      timeoutMs,
    );
    const finish = (error: Error | undefined, bytes?: Uint8Array): void => {
      if (finishing) return;
      finishing = true;
      failure = error;
      output = bytes ?? new Uint8Array();
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      child.kill("SIGKILL");
    };
    const abort = (): void => finish(new Error("Making the PDF was canceled."));
    signal.addEventListener("abort", abort, { once: true });
    child.stderr?.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString("utf8")).slice(-2000);
    });
    child.on("error", (error) => finish(error));
    child.on("close", (code) => {
      if (!finishing)
        finish(new Error(`Slopify's PDF maker stopped (exit ${String(code)}). ${stderr}`.trim()));
      if (failure !== undefined) reject(failure);
      else resolve(output);
    });
    child.on("message", (raw: unknown) => {
      if (finishing) return;
      const parsed = pdfWorkerMessage.safeParse(raw);
      if (!parsed.success) {
        finish(
          new Error(
            "Slopify's PDF maker answered with something it can't read. Press Download PDF again.",
          ),
        );
        return;
      }
      if (parsed.data.type === "error")
        finish(new Error(`The PDF couldn't be made: ${parsed.data.message}`));
      else finish(undefined, parsed.data.bytes);
    });
    if (signal.aborted) {
      abort();
      return;
    }
    child.send(job, (error) => {
      if (error !== null) finish(error);
    });
  });
}
