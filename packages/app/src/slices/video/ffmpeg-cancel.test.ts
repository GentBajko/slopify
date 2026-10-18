import { expect, it } from "vitest";
import { binary } from "./export.fake.js";
import { runFfmpeg } from "./ffmpeg.js";

// A cancel that lands while ffmpeg is working stops the process at once rather than letting
// the render run to its end.
it("kills a render in progress when it is canceled", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const running = runFfmpeg({
    bin: binary,
    args: [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-re",
      "-i",
      "sine=frequency=440:duration=600",
      "-f",
      "null",
      "-",
    ],
    signal: controller.signal,
    log: { write: () => undefined },
    onProgress: () => undefined,
  });
  setTimeout(() => controller.abort(), 150);
  await expect(running).rejects.toThrow(/cancel/i);
  expect(Date.now() - started).toBeLessThan(10_000);
});
