import { describe, expect, it } from "vitest";
import type { RenderPriority } from "./encoding.js";
import { type RenderRun, runFfmpegAt } from "./ffmpeg.js";

const run: RenderRun = {
  bin: "ffmpeg",
  args: ["-version"],
  signal: AbortSignal.timeout(1000),
  onProgress: () => undefined,
  log: { write: () => undefined },
};

describe("runFfmpegAt", () => {
  it("runs each call at the render priority saved as it starts", async () => {
    let saved: RenderPriority = "background";
    const seen: (RenderPriority | undefined)[] = [];
    const runAt = runFfmpegAt(
      () => saved,
      async (call) => {
        seen.push(call.priority);
      },
    );
    await runAt(run);
    saved = "normal";
    await runAt(run);
    expect(seen).toEqual(["background", "normal"]);
  });

  it("keeps a priority the caller chose itself", async () => {
    const seen: (RenderPriority | undefined)[] = [];
    await runFfmpegAt(
      () => "background",
      async (call) => {
        seen.push(call.priority);
      },
    )({ ...run, priority: "normal" });
    expect(seen).toEqual(["normal"]);
  });
});
