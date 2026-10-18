import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import type { EditList } from "./edit-list.js";
import { createNvencProbe } from "./encoding.js";
import { resolveFfmpeg } from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";
import { burnParts, renderSlideshow } from "./slideshow.js";

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

  // Real ffmpeg: a square project renders a 1080x1080 video.
  it("renders a square video for a 1:1 project", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      const still = join(scratch, "still.ppm");
      writeFileSync(
        still,
        Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, 90)]),
      );
      const output = join(scratch, "out.mp4");
      const bin = resolveFfmpeg(process.env, ffmpegStatic);
      const { edit } = plan({ format: "1:1", imageSeconds: 1, images: [still], body: undefined });
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
      // ffmpeg -i with no output exits 1 and prints the streams on stderr.
      const probe = spawnSync(bin, ["-hide_banner", "-i", output]).stderr.toString();
      expect(probe).toMatch(/Video: .* 1080x1080/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  // Real ffmpeg, two renders of one slideshow with a clip cache: the second encodes nothing
  // and plays the very files the first kept.
  it("reuses the last render's clips", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      const still = join(scratch, "still.ppm");
      writeFileSync(
        still,
        Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, 90)]),
      );
      const cache = join(scratch, ".render-cache", "p1");
      const render = (output: string): Promise<unknown> =>
        renderSlideshow({
          bin: resolveFfmpeg(process.env, ffmpegStatic),
          ...plan({ imageSeconds: 1, images: [still, still], body: undefined, output }),
          burnSubtitles: false,
          scratch,
          cache,
          jobs: 2,
          signal: new AbortController().signal,
          log,
          onProgress: (): void => {},
        });
      await render(join(scratch, "one.mp4"));
      const kept = readdirSync(cache).map((name) => [name, statSync(join(cache, name)).ino]);
      expect(kept.length).toBeGreaterThan(0);
      await render(join(scratch, "two.mp4"));
      expect(readdirSync(cache).map((name) => [name, statSync(join(cache, name)).ino])).toEqual(
        kept,
      );
      expect(statSync(join(scratch, "two.mp4")).size).toBeGreaterThan(0);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});

// The computer's NVENC, when it has one: the same probe Settings uses.
const nvenc = await createNvencProbe({
  candidates: [resolveFfmpeg(process.env, ffmpegStatic), "ffmpeg", "/usr/bin/ffmpeg"],
  exec: async (bin, args) =>
    (await promisify(execFile)(bin, [...args], { timeout: 20_000 })).stdout.toString(),
  log,
})();

describe("renderSlideshow on the NVIDIA card", () => {
  const still = (scratch: string): string => {
    const path = join(scratch, "still.ppm");
    writeFileSync(
      path,
      Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, 90)]),
    );
    return path;
  };

  // A card chosen but failing mid-render never fails the render: the processor makes it, and
  // the notice says so.
  it("renders on the processor with a notice when the NVENC ffmpeg fails", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      const output = join(scratch, "out.mp4");
      const notices: string[] = [];
      await renderSlideshow({
        bin: resolveFfmpeg(process.env, ffmpegStatic),
        ...plan({ imageSeconds: 1, images: [still(scratch)], body: undefined, output }),
        burnSubtitles: false,
        scratch,
        machine: {
          encode: { kind: "nvenc", bin: "/nonexistent/ffmpeg", clipSpeed: "fast" },
          priority: "background",
        },
        notice: (sentence) => notices.push(sentence),
        signal: new AbortController().signal,
        log,
        onProgress: (): void => {},
      });
      expect(statSync(output).size).toBeGreaterThan(0);
      expect(readFileSync(output).includes("x264 - core")).toBe(true);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatch(/encoded on the processor/);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);

  // Real NVENC, on a computer that has it: clips joined by copying and captions burned in.
  it.skipIf(!nvenc.available).each([false, true])(
    "encodes with NVENC (captions burned in: %s)",
    async (burn) => {
      const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
      try {
        writeFileSync(
          join(scratch, "subtitles.ass"),
          "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
        );
        mkdirSync(join(scratch, "fonts"));
        const output = join(scratch, "out.mp4");
        const notices: string[] = [];
        await renderSlideshow({
          bin: resolveFfmpeg(process.env, ffmpegStatic),
          ...plan({
            imageSeconds: 1,
            images: [still(scratch), still(scratch)],
            body: undefined,
            output,
          }),
          burnSubtitles: burn,
          cwd: scratch,
          scratch,
          machine: {
            encode: { kind: "nvenc", bin: nvenc.available ? nvenc.bin : "", clipSpeed: "thorough" },
            priority: "background",
          },
          notice: (sentence) => notices.push(sentence),
          signal: new AbortController().signal,
          log,
          onProgress: (): void => {},
        });
        expect(notices).toEqual([]);
        // x264 signs every stream it writes; NVENC does not.
        expect(readFileSync(output).includes("x264 - core")).toBe(false);
        const probe = spawnSync(resolveFfmpeg(process.env, ffmpegStatic), [
          ...["-hide_banner", "-v", "error", "-i", output, "-f", "null", "-"],
        ]);
        expect(probe.status).toBe(0);
        expect(probe.stderr.toString()).toBe("");
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    },
    60_000,
  );
});

describe("burnParts", () => {
  const clips = [
    { name: "c1.mp4", frames: 1800 },
    { name: "c2.mp4", frames: 900 },
  ];

  it("cuts the timeline at clips into parts of about equal length", () => {
    const order = ["c1.mp4", "c2.mp4", "c2.mp4", "c1.mp4", "c2.mp4", "c2.mp4"];
    expect(burnParts(order, clips, 3)).toEqual([
      { name: "p1", names: ["c1.mp4", "c2.mp4"], start: 0, frames: 2700 },
      { name: "p2", names: ["c2.mp4", "c1.mp4"], start: 2700, frames: 2700 },
      { name: "p3", names: ["c2.mp4", "c2.mp4"], start: 5400, frames: 1800 },
    ]);
  });

  it("keeps a video under two minutes in one part, and no part under a minute", () => {
    expect(burnParts(["c1.mp4", "c2.mp4"], clips, 8)).toHaveLength(1);
    const parts = burnParts(["c1.mp4", "c1.mp4", "c2.mp4"], clips, 8);
    expect(parts.map((part) => part.frames)).toEqual([1800, 2700]);
  });
});
