import { spawn } from "node:child_process";

export async function decodeAudio(
  ffmpeg: string,
  source: string,
  output: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const child = spawn(
      ffmpeg,
      [
        "-hide_banner",
        "-nostdin",
        "-loglevel",
        "error",
        "-y",
        "-i",
        source,
        "-map",
        "0:a:0",
        "-vn",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "f32le",
        output,
      ],
      { stdio: ["ignore", "ignore", "pipe"], windowsHide: true },
    );
    let errorText = "";
    const abort = (): void => {
      child.kill("SIGKILL");
    };
    signal.addEventListener("abort", abort, { once: true });
    child.stderr.on("data", (data: Buffer) => {
      errorText = (errorText + data.toString("utf8")).slice(-2000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(new Error("Subtitle audio preparation was canceled."));
      else if (code !== 0)
        reject(new Error(`Could not prepare the narration for subtitles. ${errorText}`));
      else resolve();
    });
    if (signal.aborted) abort();
  });
}
