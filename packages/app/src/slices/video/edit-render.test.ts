import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveFont } from "../fonts/index.js";
import type { Look } from "./edit-list.js";
import type { TransitionKind } from "./edit-settings.js";
import { probeDurationMs, resolveFfmpeg } from "./ffmpeg.js";
import { type PlanEdit, type PlanInput, planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

// The edit settings rendered for real with the bundled ffmpeg, on stills and tones it makes
// itself: transitions keep the video exactly as long as its sound, the Look changes the
// frames it should, a chapter card shows at its chapter, and a clip plays in an image's place.

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const log = { write: (): void => {} };
let scratch = "";

function make(name: string, args: readonly string[]): string {
  const path = join(scratch, name);
  execFileSync(bin, ["-v", "error", "-y", ...args, path]);
  return path;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-edit-render-"));
  make("red.png", ["-f", "lavfi", "-i", "color=c=0xc03030:s=320x180", "-frames:v", "1"]);
  make("blue.png", ["-f", "lavfi", "-i", "color=c=0x3050c0:s=320x180", "-frames:v", "1"]);
  make("grey.png", ["-f", "lavfi", "-i", "color=c=0x808080:s=320x180", "-frames:v", "1"]);
  make("dark.png", ["-f", "lavfi", "-i", "color=c=0x101010:s=320x180", "-frames:v", "1"]);
  make("tone.wav", ["-f", "lavfi", "-i", "sine=frequency=440:duration=7.3"]);
  make("clip.mp4", [
    ...["-f", "lavfi", "-i", "testsrc2=s=320x180:r=30", "-t", "1"],
    ...["-pix_fmt", "yuv420p"],
  ]);
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

async function render(over: Partial<PlanInput>, edit: PlanEdit, name: string): Promise<string> {
  const output = join(scratch, name);
  const plan = planRender({
    format: "16:9",
    gapSeconds: 0,
    edgeSeconds: 0,
    imageSeconds: 2,
    zoomPercent: 0,
    motionStyle: "still",
    images: [join(scratch, "red.png"), join(scratch, "blue.png")],
    output,
    edit,
    ...over,
  });
  await renderSlideshow({
    bin,
    edit: plan.editList,
    output,
    burnSubtitles: false,
    scratch,
    signal: new AbortController().signal,
    log,
    onProgress: (): void => {},
  });
  return output;
}

// The video stream's frame count, from a full decode.
function frameCount(file: string): number {
  const said = spawnSync(bin, ["-hide_banner", "-i", file, "-map", "0:v", "-f", "null", "-"], {
    encoding: "utf8",
  }).stderr;
  const counts = [...said.matchAll(/frame=\s*(\d+)/g)].map((match) => Number(match[1]));
  return counts.at(-1) ?? 0;
}

// Frame `at` scaled down to 16x9 RGB, as [r, g, b] per cell, row by row.
function cells(file: string, at: number): number[][] {
  const raw = execFileSync(bin, [
    ...["-hide_banner", "-loglevel", "error", "-i", file],
    ...["-vf", `select=eq(n\\,${String(at)}),scale=16:9:flags=area`, "-frames:v", "1"],
    ...["-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
  ]);
  const out: number[][] = [];
  for (let at = 0; at + 2 < raw.length; at += 3)
    out.push([raw[at] ?? 0, raw[at + 1] ?? 0, raw[at + 2] ?? 0]);
  return out;
}
const brightness = (cell: readonly number[] | undefined): number =>
  ((cell?.[0] ?? 0) + (cell?.[1] ?? 0) + (cell?.[2] ?? 0)) / 3;
const centre = (file: string, at: number): readonly number[] | undefined =>
  cells(file, at)[4 * 16 + 8];

describe("transitions", () => {
  it.each<TransitionKind>(["crossfade", "fadeblack", "slide", "wipe"])(
    "keep a %s video exactly as long as its sound",
    async (kind) => {
      const output = await render(
        {
          gapSeconds: 0,
          edgeSeconds: 0.5,
          body: { path: join(scratch, "tone.wav"), seconds: 7.3 },
          images: [join(scratch, "red.png"), join(scratch, "blue.png"), join(scratch, "grey.png")],
        },
        { transition: { kind: kind === "cut" ? "crossfade" : kind, seconds: 0.6 } },
        `transition-${kind}.mp4`,
      );
      // 0.5 + 7.3 + 0.5 s at 30 fps.
      expect(frameCount(output)).toBe(249);
      const ms = await probeDurationMs(bin, output, new AbortController().signal, log);
      expect(Math.abs(ms - 8300)).toBeLessThan(40);
    },
    60_000,
  );

  it("blends the two shots across the cut", async () => {
    const output = await render({}, { transition: { kind: "crossfade", seconds: 1 } }, "mix.mp4");
    // 4 s of two 2 s shots: frame 60 is the middle of the 30-frame crossfade.
    const [red, mid, blue] = [centre(output, 10), centre(output, 60), centre(output, 110)];
    expect(red?.[0]).toBeGreaterThan(150);
    expect(blue?.[2]).toBeGreaterThan(150);
    expect(mid?.[0]).toBeGreaterThan(80);
    expect(mid?.[0]).toBeLessThan(170);
    expect(mid?.[2]).toBeGreaterThan(80);
    expect(frameCount(output)).toBe(120);
  }, 60_000);
});

describe("the Look", () => {
  const look = (over: Partial<Look>): Look => ({
    vignette: "off",
    grain: "off",
    grade: "none",
    atmosphere: "none",
    ...over,
  });

  it("darkens the corners with a vignette", async () => {
    const output = await render(
      { images: [join(scratch, "grey.png")] },
      { look: look({ vignette: "strong" }) },
      "vignette.mp4",
    );
    const frame = cells(output, 5);
    expect(brightness(frame[0])).toBeLessThan(brightness(frame[4 * 16 + 8]) - 25);
    expect(frameCount(output)).toBe(60);
  }, 60_000);

  it("tints the picture with a colour grade", async () => {
    const output = await render(
      { images: [join(scratch, "grey.png")] },
      { look: look({ grade: "sepia" }) },
      "sepia.mp4",
    );
    const [r, , b] = centre(output, 5) ?? [];
    expect((r ?? 0) - (b ?? 0)).toBeGreaterThan(30);
  }, 60_000);

  it("moves grain from frame to frame on a flat picture", async () => {
    const output = await render(
      { images: [join(scratch, "grey.png")] },
      { look: look({ grain: "strong" }) },
      "grain.mp4",
    );
    // Area-averaged cells hide the grain, so the check is on raw pixels of two frames.
    const pixels = (at: number) =>
      execFileSync(bin, [
        ...["-hide_banner", "-loglevel", "error", "-i", output],
        ...["-vf", `select=eq(n\\,${String(at)}),crop=64:64:900:500`, "-frames:v", "1"],
        ...["-pix_fmt", "gray", "-f", "rawvideo", "-"],
      ]);
    const [a, b] = [pixels(10), pixels(11)];
    let differing = 0;
    for (let at = 0; at < a.length; at += 1)
      if (Math.abs((a[at] ?? 0) - (b[at] ?? 0)) > 3) differing += 1;
    expect(differing).toBeGreaterThan(a.length / 4);
  }, 60_000);

  it.each(["embers", "dust", "fog"] as const)(
    "draws %s over the picture without changing its length",
    async (atmosphere) => {
      const plain = await render(
        { images: [join(scratch, "dark.png")] },
        {},
        `plain-${atmosphere}.mp4`,
      );
      const output = await render(
        { images: [join(scratch, "dark.png")] },
        { look: look({ atmosphere }) },
        `atmosphere-${atmosphere}.mp4`,
      );
      // Specks are too small to move an average, so the check counts lit pixels.
      const lit = (file: string) => {
        const gray = execFileSync(
          bin,
          [
            ...["-hide_banner", "-loglevel", "error", "-i", file],
            ...["-vf", "select=eq(n\\,30)", "-frames:v", "1", "-pix_fmt", "gray"],
            ...["-f", "rawvideo", "-"],
          ],
          { maxBuffer: 16 * 1024 * 1024 },
        );
        return gray.filter((value) => value > 40).length;
      };
      expect(lit(plain)).toBe(0);
      expect(lit(output)).toBeGreaterThan(200);
      expect(frameCount(output)).toBe(60);
    },
    60_000,
  );

  it("keeps a flat picture as it was with the Look all off", async () => {
    const output = await render(
      { images: [join(scratch, "grey.png")] },
      { look: look({}) },
      "off.mp4",
    );
    const frame = cells(output, 5);
    expect(Math.abs(brightness(frame[0]) - brightness(frame[4 * 16 + 8]))).toBeLessThan(3);
  }, 60_000);
});

describe("chapter cards", () => {
  it("show the chapter's title at its start and are gone after", async () => {
    const font = await resolveFont({ dataDir: scratch } as never, "default");
    const output = await render(
      { images: [join(scratch, "dark.png")], imageSeconds: 6 },
      {
        cards: {
          chapters: [{ title: "The Fall of the Old Kingdom", start: 1 }],
          font: { path: font.path, name: font.assName },
        },
        transition: { kind: "crossfade", seconds: 0.6 },
      },
      "card.mp4",
    );
    // The title is drawn across the middle of the frame: brightest while it shows.
    const middle = (at: number) =>
      cells(output, at)
        .slice(4 * 16, 5 * 16)
        .reduce((sum, cell) => sum + brightness(cell), 0);
    const before = middle(15);
    expect(middle(60)).toBeGreaterThan(before + 20);
    expect(Math.abs(middle(150) - before)).toBeLessThan(5);
    expect(frameCount(output)).toBe(180);
  }, 60_000);
});

describe("clips in an image's place", () => {
  it("loop and slow a short clip to fill its shot, muted, frame for frame", async () => {
    const output = await render(
      { images: [join(scratch, "red.png"), join(scratch, "clip.mp4")], imageSeconds: 3 },
      {
        clips: [undefined, { kind: "video", path: join(scratch, "clip.mp4"), seconds: 1 }],
        transition: { kind: "crossfade", seconds: 0.4 },
      },
      "clip.mp4.out.mp4",
    );
    expect(frameCount(output)).toBe(180);
    // The clip moves: two frames a second apart inside its shot differ.
    const a = cells(output, 110);
    const b = cells(output, 140);
    const moved = a.some((cell, at) => Math.abs(brightness(cell) - brightness(b[at])) > 10);
    expect(moved).toBe(true);
  }, 60_000);
});
