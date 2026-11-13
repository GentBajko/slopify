import { execFile, execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statfsSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it, vi } from "vitest";
import type { EditList } from "./edit-list.js";
import { createNvencProbe } from "./encoding.js";
import { resolveFfmpeg } from "./ffmpeg.js";
import type { PlanInput } from "./plan.js";
import { planRender } from "./plan.js";
import { burnParts, renderSlideshow } from "./slideshow.js";

// The disk the clip cache sees, so a test can give it room whatever the machine has left.
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return { ...fs, statfsSync: vi.fn(fs.statfsSync) };
});

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
      // The cache gives way on a disk with less than 20 GB free (`clip-cache.ts`): this one has
      // 2 TB free, so the test does not depend on the space left where it runs.
      const disk = statfsSync(scratch);
      vi.mocked(statfsSync).mockReturnValue({
        ...disk,
        bsize: 4096,
        blocks: 2 ** 30,
        bavail: 2 ** 29,
      });
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
      vi.mocked(statfsSync).mockRestore();
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 30_000);
});

// Real ffmpeg, 1-second slots, and a caption that is a white box over the whole frame so no
// font is needed and a frame's brightness says whether it is on.
describe("renderSlideshow with burned-in captions", () => {
  const bin = resolveFfmpeg(process.env, ffmpegStatic);
  const still = (scratch: string, name: string, grey: number): string => {
    const path = join(scratch, name);
    writeFileSync(
      path,
      Buffer.concat([Buffer.from("P6\n16 16\n255\n"), Buffer.alloc(16 * 16 * 3, grey)]),
    );
    return path;
  };
  const captions = (scratch: string, from: string, to: string): void => {
    mkdirSync(join(scratch, "fonts"), { recursive: true });
    writeFileSync(
      join(scratch, "subtitles.ass"),
      [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, Alignment, MarginL, MarginR, MarginV",
        "Style: Default,Arial,20,&H00FFFFFF,7,0,0,0",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Text",
        `Dialogue: 0,${from},${to},Default,{\\pos(0,0)\\p1}m 0 0 l 1920 0 1920 1080 0 1080{\\p0}`,
        "",
      ].join("\n"),
    );
  };
  // A frame's mean brightness; NaN past the last frame.
  const brightness = (file: string, frame: number): number => {
    const gray = execFileSync(bin, [
      ...["-hide_banner", "-loglevel", "error", "-i", file],
      ...["-vf", `select=eq(n\\,${String(frame)}),scale=8:1:flags=area`, "-frames:v", "1"],
      ...["-pix_fmt", "gray", "-f", "rawvideo", "-"],
    ]);
    return gray.reduce((sum, value) => sum + value, 0) / gray.length;
  };
  const roomy = (scratch: string): void => {
    const disk = statfsSync(scratch);
    vi.mocked(statfsSync).mockReturnValue({
      ...disk,
      bsize: 4096,
      blocks: 2 ** 30,
      bavail: 2 ** 29,
    });
  };
  const render = (scratch: string, images: readonly string[], output: string): Promise<unknown> =>
    renderSlideshow({
      bin,
      ...plan({ imageSeconds: 1, images: [...images], body: undefined, output }),
      burnSubtitles: true,
      cwd: scratch,
      scratch,
      cache: join(scratch, ".render-cache", "p1"),
      jobs: 2,
      signal: new AbortController().signal,
      log,
      onProgress: (): void => {},
    });
  const kept = (scratch: string): string[] =>
    readdirSync(join(scratch, ".render-cache", "p1")).map((name) =>
      join(scratch, ".render-cache", "p1", name),
    );

  // Two stills shown once each, and a caption from 0.5 s to 1.5 s, across the cut at 1 s.
  it("has each clip draw its own captions when the stills are shown once", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      roomy(scratch);
      captions(scratch, "0:00:00.50", "0:00:01.50");
      const output = join(scratch, "out.mp4");
      await render(scratch, [still(scratch, "a.ppm", 90), still(scratch, "b.ppm", 60)], output);
      // On from frame 15 to frame 44, over the cut, and on no frame more.
      expect(brightness(output, 14)).toBeLessThan(150);
      expect(brightness(output, 15)).toBeGreaterThan(200);
      expect(brightness(output, 29)).toBeGreaterThan(200);
      expect(brightness(output, 30)).toBeGreaterThan(200);
      expect(brightness(output, 44)).toBeGreaterThan(200);
      expect(brightness(output, 45)).toBeLessThan(150);
      expect(brightness(output, 59)).toBeLessThan(150);
      expect(brightness(output, 60)).toBeNaN();
      // The clips kept for the next render carry the caption already: no frame was encoded
      // a second time to put it there.
      const clips = kept(scratch);
      expect(clips).toHaveLength(2);
      for (const clip of clips) {
        const [early, late] = [brightness(clip, 5), brightness(clip, 20)];
        expect(Math.max(early, late)).toBeGreaterThan(200);
        expect(Math.min(early, late)).toBeLessThan(150);
      }
      expect(readdirSync(scratch).sort()).toEqual(
        [".render-cache", "a.ppm", "b.ppm", "fonts", "out.mp4", "subtitles.ass"].sort(),
      );
    } finally {
      vi.mocked(statfsSync).mockRestore();
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

  // A white portrait in the top-left corner of the speaker panel, no caption on screen.
  it("lays the speaker portraits into each clip, from the caption folder", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      roomy(scratch);
      captions(scratch, "0:00:10.00", "0:00:11.00");
      const images = [still(scratch, "a.ppm", 60), still(scratch, "b.ppm", 60)];
      const withPortrait = (output: string): Promise<unknown> => {
        // Written anew for every render, as the caption folder is.
        still(scratch, "portrait-0.ppm", 255);
        return renderSlideshow({
          bin,
          ...plan({ imageSeconds: 1, images, body: undefined, output }),
          burnSubtitles: true,
          cwd: scratch,
          portraits: [{ path: "portrait-0.ppm", x: 0, y: 0, size: 240 }],
          scratch,
          cache: join(scratch, ".render-cache", "p1"),
          jobs: 2,
          signal: new AbortController().signal,
          log,
          onProgress: (): void => {},
        });
      };
      const output = join(scratch, "out.mp4");
      await withPortrait(output);
      const patch = (frame: number, x: number): number => {
        const gray = execFileSync(bin, [
          ...["-hide_banner", "-loglevel", "error", "-i", output],
          ...[
            "-vf",
            `select=eq(n\\,${String(frame)}),crop=200:200:${String(x)}:20,scale=1:1:flags=area`,
          ],
          ...["-frames:v", "1", "-pix_fmt", "gray", "-f", "rawvideo", "-"],
        ]);
        return gray[0] ?? Number.NaN;
      };
      for (const frame of [0, 29, 30, 59]) {
        expect(patch(frame, 20)).toBeGreaterThan(200);
        expect(patch(frame, 1000)).toBeLessThan(150);
      }
      // The same portrait in a file of another date is the same clip.
      const first = kept(scratch).map((path) => [path, statSync(path).ino]);
      expect(first).toHaveLength(2);
      await withPortrait(join(scratch, "again.mp4"));
      expect(kept(scratch).map((path) => [path, statSync(path).ino])).toEqual(first);
    } finally {
      vi.mocked(statfsSync).mockRestore();
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

  it("encodes again only the clip whose captions changed", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      roomy(scratch);
      const images = [still(scratch, "a.ppm", 90), still(scratch, "b.ppm", 60)];
      captions(scratch, "0:00:00.50", "0:00:01.50");
      await render(scratch, images, join(scratch, "one.mp4"));
      const first = kept(scratch).map((path) => [path, statSync(path).ino]);
      // The second clip's caption now ends later; the first clip shows what it showed.
      captions(scratch, "0:00:00.50", "0:00:01.80");
      await render(scratch, images, join(scratch, "two.mp4"));
      const second = kept(scratch).map((path) => [path, statSync(path).ino]);
      expect(second).toHaveLength(2);
      expect(second.filter((one) => first.some((other) => `${other}` === `${one}`))).toHaveLength(
        1,
      );
      expect(brightness(join(scratch, "two.mp4"), 53)).toBeGreaterThan(200);
      expect(brightness(join(scratch, "two.mp4"), 54)).toBeLessThan(150);
    } finally {
      vi.mocked(statfsSync).mockRestore();
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

  // One still for eight slots: two distinct clips, a quarter of the video.
  it("burns the captions over the joined clips when the same still comes round", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      roomy(scratch);
      captions(scratch, "0:00:00.50", "0:00:01.50");
      const one = still(scratch, "a.ppm", 90);
      const output = join(scratch, "out.mp4");
      await render(
        scratch,
        Array.from({ length: 8 }, () => one),
        output,
      );
      expect(brightness(output, 14)).toBeLessThan(150);
      expect(brightness(output, 15)).toBeGreaterThan(200);
      expect(brightness(output, 44)).toBeGreaterThan(200);
      expect(brightness(output, 45)).toBeLessThan(150);
      expect(brightness(output, 239)).toBeLessThan(150);
      expect(brightness(output, 240)).toBeNaN();
      // The kept clips are the two pictures, with no caption on them.
      const clips = kept(scratch);
      expect(clips).toHaveLength(2);
      for (const clip of clips) {
        expect(brightness(clip, 5)).toBeLessThan(150);
        expect(brightness(clip, 20)).toBeLessThan(150);
      }
    } finally {
      vi.mocked(statfsSync).mockRestore();
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 60_000);

  it("says so when the captions cannot be read", async () => {
    const scratch = mkdtempSync(join(tmpdir(), "slopify-slideshow-"));
    try {
      await expect(
        render(scratch, [still(scratch, "a.ppm", 90), still(scratch, "b.ppm", 60)], "/unused.mp4"),
      ).rejects.toThrow(/Slopify hit an internal error \(the captions could not be read: /);
      expect(readdirSync(scratch).sort()).toEqual(["a.ppm", "b.ppm"]);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });
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
