import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

function plan(over: Partial<PlanInput> = {}): ReturnType<typeof planRender> {
  return planRender({
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 5,
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  });
}

const log = { write: (): void => {} };

describe("renderSlideshow", () => {
  it("removes its working directory when ffmpeg cannot run", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      await expect(
        renderSlideshow({
          bin: "/nonexistent/ffmpeg",
          plan: plan(),
          burnSubtitles: false,
          scratch,
          signal: new AbortController().signal,
          log,
          onProgress: (): void => {},
        }),
      ).rejects.toThrow(/could not start ffmpeg/);
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("starts nothing when the render was already canceled", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    const controller = new AbortController();
    controller.abort();
    try {
      await expect(
        renderSlideshow({
          bin: process.execPath,
          plan: plan(),
          burnSubtitles: false,
          scratch,
          signal: controller.signal,
          log,
          onProgress: (): void => {},
        }),
      ).rejects.toThrow(/canceled before it started/);
      expect(readdirSync(scratch)).toEqual([]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
});
