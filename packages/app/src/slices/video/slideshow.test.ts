import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { resolveFfmpeg } from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

function plan(over: Partial<PlanInput> = {}): ReturnType<typeof planRender> {
  return planRender({
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 5,
    zoomPercent: 22.5,
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

  // Real ffmpeg, a tiny still and a one-second slideshow: a failure in either step must
  // reject in ffmpeg's own words and leave neither working files nor a partial output.
  it.each(["clip", "join"] as const)(
    "rejects when the %s step fails",
    async (step) => {
      const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
      try {
        const still = join(scratch, "still.ppm");
        writeFileSync(
          still,
          Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, 90)]),
        );
        const broken = join(scratch, "broken.png");
        writeFileSync(broken, "not an image");
        const output = join(scratch, "out.mp4");
        await expect(
          renderSlideshow({
            bin: resolveFfmpeg(process.env, ffmpegStatic),
            plan: plan({
              imageSeconds: 1,
              images: [step === "clip" ? broken : still],
              // The join is the only step that reads the narration.
              body: { path: join(scratch, "missing.wav"), seconds: 1 },
              output,
            }),
            burnSubtitles: false,
            scratch,
            signal: new AbortController().signal,
            log,
            onProgress: (): void => {},
          }),
        ).rejects.toThrow(/ffmpeg exited with code \d+: .+/);
        expect(readdirSync(scratch).sort()).toEqual(["broken.png", "still.ppm"]);
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    30_000,
  );
});
