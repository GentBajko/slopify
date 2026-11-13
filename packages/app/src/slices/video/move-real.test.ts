import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import type { Motion } from "./edit-list.js";
import { binary } from "./export.fake.js";
import { clipArgs } from "./ffmpeg.js";
import type { StillSize } from "./move.js";

// A still's move through the real ffmpeg, measured on the frames its own filtergraph makes
// before any encoder touches them: a slow move must advance by the same amount every frame.

// Each case runs the real ffmpeg several times, which a busy machine stretches past the default.
vi.setConfig({ testTimeout: 60_000 });

const width = 320;
const height = 180;
const fps = 30;
const frames = 240;
const work = mkdtempSync(join(tmpdir(), "slopify-move-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

// A grey PNG from a rule for each pixel.
function still(name: string, size: StillSize, grey: (x: number, y: number) => number): string {
  const path = join(work, name);
  const pixels = Buffer.alloc(size.width * size.height * 3);
  for (let y = 0; y < size.height; y += 1)
    for (let x = 0; x < size.width; x += 1)
      pixels.fill(Math.round(grey(x, y)), (y * size.width + x) * 3, (y * size.width + x) * 3 + 3);
  execFileSync(
    binary,
    [
      ...["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24"],
      ...["-s", `${String(size.width)}x${String(size.height)}`, "-i", "pipe:0"],
      ...["-frames:v", "1", "-c:v", "png", "-pix_fmt", "rgb24", path],
    ],
    { input: pixels },
  );
  return path;
}

// The luma plane of every frame of the shot, as the clip's own filtergraph hands it on.
function lumas(path: string, motion: Motion, size?: StillSize): Uint8Array[] {
  const args = clipArgs(
    { width, height, fps, ...(size === undefined ? {} : { stills: new Map([[path, size]]) }) },
    { source: { kind: "image", path }, frames, motion },
    join(work, "unused.mp4"),
  );
  const graph = args[args.indexOf("-filter_complex") + 1] ?? "";
  const raw = execFileSync(
    binary,
    [
      ...["-v", "error", "-i", path, "-filter_complex", graph, "-map", "[v]"],
      ...["-frames:v", String(frames), "-f", "rawvideo", "-pix_fmt", "yuv420p", "pipe:1"],
    ],
    { maxBuffer: 256 * 1024 * 1024 },
  );
  const frame = (width * height * 3) / 2;
  return Array.from({ length: frames }, (_, at) =>
    raw.subarray(at * frame, at * frame + width * height),
  );
}

const mean = (luma: Uint8Array): number =>
  luma.reduce((sum, value) => sum + value, 0) / luma.length;

// Where the picture's light sits, in pixels from the left and from the top.
function centre(luma: Uint8Array): readonly [number, number] {
  let light = 0;
  let across = 0;
  let down = 0;
  for (let y = 0; y < height; y += 1)
    for (let x = 0; x < width; x += 1) {
      const value = (luma[y * width + x] ?? 16) - 16;
      light += value;
      across += value * x;
      down += value * y;
    }
  return [across / light, down / light];
}

const ramp = (size: StillSize) => (x: number) => (255 * x) / (size.width - 1);
const glow = (size: StillSize) => (x: number, y: number) =>
  255 *
  Math.exp(
    -((x - (size.width - 1) / 2) ** 2 + (y - (size.height - 1) / 2) ** 2) /
      (2 * (0.15 * size.width) ** 2),
  );

// Larger than the frame, and smaller than it: the two bases a still is sampled from (`move.ts`).
const sizes: readonly {
  readonly name: string;
  readonly size: StillSize;
  readonly told: boolean;
}[] = [
  { name: "a still larger than the frame", size: { width: 640, height: 360 }, told: true },
  { name: "a still smaller than the frame", size: { width: 256, height: 144 }, told: true },
  { name: "a still of unknown size", size: { width: 640, height: 360 }, told: false },
];

describe.each(sizes)("the move of $name", ({ name, size, told }) => {
  it("pans by the same amount every frame, however slow", () => {
    // Left to right across a ramp, so the frame's mean brightness is where the pan stands.
    const path = still(`${name} ramp.png`, size, ramp(size));
    const pan: Motion = {
      kind: "pan",
      from: { x: 0, y: 0.5 },
      to: { x: 1, y: 0.5 },
      percent: 22.5,
    };
    const stands = lumas(path, pan, told ? size : undefined).map(mean);
    const steps = stands.slice(1).map((stand, at) => stand - (stands[at] ?? 0));
    const even = ((stands.at(-1) ?? 0) - (stands[0] ?? 0)) / steps.length;
    // The whole move is under a fifth of the frame: a step is a fraction of a pixel.
    expect(even).toBeGreaterThan(0.05);
    const off = Math.max(...steps.map((step) => Math.abs(step - even)));
    expect(
      off,
      `steps ${Math.min(...steps).toFixed(3)} to ${Math.max(...steps).toFixed(3)}`,
    ).toBeLessThan(even * 0.35);
  });

  it("zooms about the centre without the picture shaking", () => {
    const path = still(`${name} glow.png`, size, glow(size));
    const zoom: Motion = { kind: "zoom", direction: "in", percent: 22.5 };
    const centres = lumas(path, zoom, told ? size : undefined).map(centre);
    for (const axis of [0, 1] as const) {
      const along = centres.map((one) => one[axis]);
      const jumps = along.slice(1).map((place, at) => Math.abs(place - (along[at] ?? 0)));
      const wander = Math.max(...along) - Math.min(...along);
      // zoompan's centre jumped by up to 0.4 of a pixel from one frame to the next.
      expect(Math.max(...jumps), `axis ${String(axis)} jumped`).toBeLessThan(0.02);
      // The zoom is about the pixel beside the exact centre, so over its whole length the
      // picture drifts by about a tenth of a pixel, evenly.
      expect(wander, `axis ${String(axis)} wandered ${wander.toFixed(3)} px`).toBeLessThan(0.2);
    }
  });
});
