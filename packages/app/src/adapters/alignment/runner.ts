import { type ForkOptions, fork } from "node:child_process";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { type WorkerInput, workerMessage } from "./protocol.js";

export async function runAlignmentWorker(
  input: WorkerInput,
  signal: AbortSignal,
  onProgress?: ((current: number, total: number) => void) | undefined,
  worker = new URL("./worker.js", import.meta.url),
): Promise<readonly TimedWord[]> {
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
    let output: readonly TimedWord[] = [];
    let stderr = "";
    const finish = (error: Error | undefined, words?: readonly TimedWord[]): void => {
      if (finishing) return;
      finishing = true;
      failure = error;
      output = words ?? [];
      signal.removeEventListener("abort", abort);
      child.kill("SIGKILL");
    };
    const abort = (): void => finish(new Error("Subtitle alignment was canceled."));
    signal.addEventListener("abort", abort, { once: true });
    child.stderr?.on("data", (data: Buffer) => {
      stderr = (stderr + data.toString("utf8")).slice(-2000);
    });
    child.on("error", (error) => finish(error));
    // Wait for close, not only the IPC answer: Windows still owns the decoded audio
    // handle until the worker has actually exited, so early cleanup can fail with EPERM.
    child.on("close", (code) => {
      if (!finishing)
        finish(
          new Error(`Local subtitle alignment stopped (exit ${String(code)}). ${stderr}`.trim()),
        );
      if (failure !== undefined) reject(failure);
      else resolve(output);
    });
    child.on("message", (raw: unknown) => {
      if (finishing) return;
      const parsed = workerMessage.safeParse(raw);
      if (!parsed.success) {
        finish(new Error("The local subtitle worker returned invalid timing data."));
        return;
      }
      const message = parsed.data;
      if (message.type === "progress") {
        try {
          onProgress?.(message.current, message.total);
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)));
        }
      } else if (message.type === "error") finish(new Error(message.message));
      else
        finish(
          undefined,
          message.words.map(({ confidence, ...word }) => ({
            ...word,
            ...(confidence === undefined ? {} : { confidence }),
          })),
        );
    });
    if (signal.aborted) {
      abort();
      return;
    }
    child.send(input, (error) => {
      if (error !== null) finish(error);
    });
  });
}
