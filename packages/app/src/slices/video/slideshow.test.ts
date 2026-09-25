import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import type { EditList } from "./edit-list.js";
import { resolveFfmpeg } from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

// The two things the renderer is given: the edit list and where to write.
function plan(over: Partial<PlanInput> = {}): { edit: EditList; output: string } {
  const planned = planRender({
    format: "16:9",
    gapSeconds: 3,
    edgeSeconds: 0,
    imageSeconds: 5,
    zoomPercent: 22.5,
    motionStyle: "zoom",
    body: { path: "/p/audio-body.mp3", seconds: 10 },
    images: ["/p/images/001.png", "/p/images/002.png", "/p/images/003.png"],
    output: "/p/video.mp4",
    ...over,
  });
  return { edit: planned.editList, output: planned.output };
}

const log = { write: (): void => {} };

describe("renderSlideshow", () => {
  it("removes its working directory when ffmpeg cannot run", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      await expect(
        renderSlideshow({
          bin: "/nonexistent/ffmpeg",
          ...plan(),
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
          ...plan(),
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
            ...plan({
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

  // Real ffmpeg on a 16x16 still that runs dark on the left to bright on the right. A pan
  // from left to right starts on the darker side and ends on the brighter; the second
  // shot comes back.
  it("pans a still across the frame", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      const still = join(scratch, "ramp.ppm");
      const pixels = Buffer.alloc(16 * 16 * 3);
      for (let at = 0; at < 16 * 16; at += 1) pixels.fill((at % 16) * 16, at * 3, at * 3 + 3);
      writeFileSync(still, Buffer.concat([Buffer.from("P6\n16 16\n255\n"), pixels]));
      const output = join(scratch, "out.mp4");
      const bin = resolveFfmpeg(process.env, ffmpegStatic);
      const { edit } = plan({
        format: "9:16",
        imageSeconds: 1,
        motionStyle: "pan",
        images: [still, still],
        body: undefined,
      });
      await renderSlideshow({
        bin,
        edit,
        output,
        burnSubtitles: false,
        scratch,
        signal: new AbortController().signal,
        log,
        onProgress: (): void => {},
      });
      expect(existsSync(output)).toBe(true);
      // The frame's mean brightness, read off an 8x1 area-averaged copy.
      const brightness = (frame: number): number => {
        const gray = execFileSync(bin, [
          ...["-hide_banner", "-loglevel", "error", "-i", output],
          ...["-vf", `select=eq(n\\,${frame}),scale=8:1:flags=area`, "-frames:v", "1"],
          ...["-pix_fmt", "gray", "-f", "rawvideo", "-"],
        ]);
        return gray.reduce((sum, value) => sum + value, 0) / gray.length;
      };
      const [start, turn, end] = [brightness(0), brightness(29), brightness(59)];
      expect(turn - start).toBeGreaterThan(20);
      expect(turn - end).toBeGreaterThan(20);
      expect(readdirSync(scratch).sort()).toEqual(["out.mp4", "ramp.ppm"]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});
