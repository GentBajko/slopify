import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { serializeAss } from "../subtitles/captions.js";
import type { EditList, Look, Motion, Shot } from "./edit-list.js";
import type { ColorGrade } from "./edit-settings.js";
import type { VideoEncode } from "./encoding.js";
import { binary } from "./export.fake.js";
import { burnPartArgs, concatList, segmentArgs } from "./ffmpeg.js";

// The picture's colours through the real ffmpeg: a pure-colour still rendered by the app's own
// arguments must come out as BT.709 limited range, and the stream must say so.

// Each case runs the real ffmpeg several times, which a busy machine stretches past the default.
vi.setConfig({ testTimeout: 60_000 });

type Rgb = readonly [number, number, number];
type Yuv = readonly [number, number, number];

const system = "/usr/bin/ffmpeg";
const binaries: readonly { readonly name: string; readonly bin: string }[] = [
  { name: "bundled", bin: binary },
  ...(existsSync(system) ? [{ name: "system", bin: system }] : []),
];

const width = 320;
const height = 180;
const fps = 30;
const work = mkdtempSync(join(tmpdir(), "slopify-colour-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));
let made = 0;
const fresh = (name: string): string => {
  made += 1;
  return join(work, `${String(made)}-${name}`);
};

const primaries: readonly { readonly name: string; readonly rgb: Rgb; readonly bt709: Yuv }[] = [
  { name: "red", rgb: [255, 0, 0], bt709: [63, 102, 240] },
  { name: "green", rgb: [0, 255, 0], bt709: [173, 42, 26] },
  { name: "blue", rgb: [0, 0, 255], bt709: [32, 240, 118] },
];

// BT.709 limited range from 8-bit full-range RGB.
function bt709([r, g, b]: Rgb): Yuv {
  const [er, eg, eb] = [r / 255, g / 255, b / 255];
  const ey = 0.2126 * er + 0.7152 * eg + 0.0722 * eb;
  return [16 + 219 * ey, 128 + (224 * (eb - ey)) / 1.8556, 128 + (224 * (er - ey)) / 1.5748];
}

// The sepia grade's colorchannelmixer matrix (`look.ts`), clipped as the filter clips.
function sepia([r, g, b]: Rgb): Rgb {
  const clip = (value: number): number => Math.min(255, Math.max(0, Math.round(value)));
  return [
    clip(0.393 * r + 0.769 * g + 0.189 * b),
    clip(0.349 * r + 0.686 * g + 0.168 * b),
    clip(0.272 * r + 0.534 * g + 0.131 * b),
  ];
}

function still(rgb: Rgb, size: readonly [number, number] = [64, 36]): string {
  const path = fresh("still.png");
  const pixels = Buffer.alloc(size[0] * size[1] * 3);
  for (let at = 0; at < pixels.length; at += 3) pixels.set(rgb, at);
  execFileSync(
    binary,
    [
      ...["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgb24"],
      ...["-s", `${String(size[0])}x${String(size[1])}`, "-i", "pipe:0"],
      ...["-frames:v", "1", "-c:v", "png", "-pix_fmt", "rgb24", path],
    ],
    { input: pixels },
  );
  return path;
}

function run(bin: string, args: readonly string[], cwd = work): void {
  execFileSync(bin, ["-y", ...args], { cwd, stdio: ["ignore", "ignore", "pipe"] });
}

function render(
  bin: string,
  shot: Shot,
  look?: Look,
  encode?: VideoEncode,
  output = fresh("clip.mp4"),
): string {
  const edit: Pick<EditList, "width" | "height" | "fps" | "shots"> &
    Partial<Pick<EditList, "look">> = {
    width,
    height,
    fps,
    shots: [shot],
    ...(look === undefined ? {} : { look }),
  };
  run(
    bin,
    segmentArgs(
      edit,
      { kind: "shot", shot: 0, from: 0, count: shot.frames, start: 0 },
      output,
      "watched",
      "cards.ass",
      encode,
    ),
  );
  return output;
}

// The stream as `ffmpeg -i` describes it, e.g. `yuv420p(tv, bt709, progressive)`.
function streamTags(path: string): string {
  let printed = "";
  try {
    execFileSync(binary, ["-hide_banner", "-i", path], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    printed = String((error as { readonly stderr?: Buffer }).stderr ?? "");
  }
  return /Video: h264[^\n]*?, (yuv420p(?:\([^)]*\))?)/.exec(printed)?.[1] ?? printed;
}

// Y, U and V of the pixel at the centre of the first frame, decoded without conversion.
function centre(path: string, size: readonly [number, number] = [width, height]): Yuv {
  const [w, h] = size;
  const raw = execFileSync(binary, [
    ...["-v", "error", "-i", path, "-frames:v", "1"],
    ...["-f", "rawvideo", "-pix_fmt", "yuv420p", "pipe:1"],
  ]);
  return yuvAt(raw, w, h, w / 2, h / 2);
}

function yuvAt(raw: Buffer, w: number, h: number, x: number, y: number): Yuv {
  const chroma = (w / 2) * (h / 2);
  const at = Math.floor(y / 2) * (w / 2) + Math.floor(x / 2);
  return [raw[y * w + x] ?? -1, raw[w * h + at] ?? -1, raw[w * h + chroma + at] ?? -1];
}

function expectNear(actual: Yuv, expected: Yuv): void {
  const off = actual.map((value, at) => Math.abs(value - (expected[at] ?? Number.NaN)));
  expect(
    off.every((one) => one <= 2),
    `got ${actual.join("/")}, expected ${expected.map((one) => one.toFixed(1)).join("/")}`,
  ).toBe(true);
}

const image = (path: string, motion: Motion = { kind: "still" }): Shot => ({
  source: { kind: "image", path },
  frames: 3,
  motion,
});
const graded = (grade: ColorGrade): Look => ({
  vignette: "off",
  grain: "off",
  grade,
  atmosphere: "none",
});

const nvenc = ((): VideoEncode | undefined => {
  if (!existsSync(system)) return undefined;
  try {
    execFileSync(system, [
      ...["-v", "error", "-f", "lavfi", "-i", "color=c=black:s=256x256:d=0.1"],
      ...["-frames:v", "1", "-c:v", "h264_nvenc", "-f", "null", "-"],
    ]);
    return { kind: "nvenc", bin: system, clipSpeed: "thorough" };
  } catch {
    return undefined;
  }
})();

describe.each(binaries)("a still's colours through the $name ffmpeg", ({ bin }) => {
  it("encodes a pure-colour still as BT.709 limited range, tagged so", () => {
    for (const { rgb, bt709: expected } of primaries) {
      const clip = render(bin, image(still(rgb)));
      expect(streamTags(clip)).toBe("yuv420p(tv, bt709, progressive)");
      expectNear(centre(clip), expected);
    }
  });

  it("keeps BT.709 on a still that zooms", () => {
    const clip = render(
      bin,
      image(still([255, 0, 0]), { kind: "zoom", direction: "in", percent: 10 }),
    );
    expectNear(centre(clip), [63, 102, 240]);
  });

  it("tags the picture under every atmosphere, vignette and grain, and through a transition", () => {
    for (const atmosphere of ["embers", "dust", "fog"] as const) {
      const look: Look = { vignette: "subtle", grain: "subtle", grade: "cold", atmosphere };
      expect(streamTags(render(bin, image(still([255, 0, 0])), look))).toBe(
        "yuv420p(tv, bt709, progressive)",
      );
    }
    const output = fresh("transition.mp4");
    const shots: readonly Shot[] = [
      image(still([255, 0, 0])),
      { ...image(still([0, 0, 255])), transition: { kind: "crossfade", frames: 2 } },
    ];
    run(
      bin,
      segmentArgs(
        { width, height, fps, shots },
        { kind: "transition", from: 0, to: 1, count: 2, start: 2 },
        output,
      ),
    );
    expect(streamTags(output)).toBe("yuv420p(tv, bt709, progressive)");
    expectNear(centre(output), [63, 102, 240]);
  });

  it("converts a sepia-graded still with BT.709", () => {
    for (const { rgb } of primaries) {
      const clip = render(bin, image(still(rgb)), graded("sepia"));
      expect(streamTags(clip)).toBe("yuv420p(tv, bt709, progressive)");
      expectNear(centre(clip), bt709(sepia(rgb)));
    }
  });

  it("desaturates a still's BT.709 chroma rather than its BT.601 chroma", () => {
    for (const { rgb, bt709: expected } of primaries) {
      const [, u, v] = centre(render(bin, image(still(rgb)), graded("desaturated")));
      const scaled = (value: number): number => 128 + 0.55 * (value - 128);
      expectNear([0, u, v], [0, scaled(expected[1]), scaled(expected[2])]);
    }
  });

  it("grades a warm still on BT.709 colour", () => {
    const rgb: Rgb = [255, 0, 0];
    const clip = render(bin, image(still(rgb)), graded("warm"));
    // The same grade by hand, with the one RGB to YUV conversion it needs made explicit.
    const reference = execFileSync(binary, [
      ...["-v", "error", "-i", still(rgb), "-frames:v", "1", "-vf"],
      "colorbalance=rs=0.02:bs=0.04:rm=0.08:gm=0.02:bm=-0.07:rh=0.07:gh=0.03:bh=-0.08," +
        "scale=out_color_matrix=bt709:out_range=tv,format=yuv444p,eq=saturation=1.12:contrast=1.04," +
        "format=yuv420p",
      ...["-f", "rawvideo", "pipe:1"],
    ]);
    expect(streamTags(clip)).toBe("yuv420p(tv, bt709, progressive)");
    expectNear(centre(clip), yuvAt(reference, 64, 36, 32, 18));
  });

  it.each([
    { tagged: "untagged", tags: [] },
    {
      tagged: "tagged BT.601",
      tags: [
        "-colorspace",
        "smpte170m",
        "-color_primaries",
        "smpte170m",
        "-color_trc",
        "smpte170m",
      ],
    },
  ])("leaves a $tagged video source's matrix alone and only tags it", ({ tags }) => {
    // BT.601 red: it must come out with the same numbers.
    const source = fresh("source.mp4");
    const planes = Buffer.alloc((64 * 36 * 3) / 2);
    planes.fill(81, 0, 64 * 36);
    planes.fill(90, 64 * 36, 64 * 36 * 1.25);
    planes.fill(240, 64 * 36 * 1.25);
    execFileSync(
      binary,
      [
        ...["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", "64x36"],
        ...["-r", "30", "-i", "pipe:0", "-c:v", "libx264", "-crf", "0", ...tags],
        source,
      ],
      { input: Buffer.concat(Array.from({ length: 30 }, () => planes)) },
    );
    const clip = render(bin, {
      source: { kind: "video", path: source, seconds: 1 },
      frames: 3,
      motion: { kind: "still" },
    });
    expect(streamTags(clip)).toBe("yuv420p(tv, bt709, progressive)");
    expectNear(centre(clip), [81, 90, 240]);
  });

  it("overlays a portrait with BT.709 under burned-in captions", () => {
    const folder = fresh("burn");
    mkdirSync(join(folder, "fonts"), { recursive: true });
    writeFileSync(
      join(folder, "subtitles.ass"),
      "[Script Info]\nScriptType: v4.00+\nPlayResX: 320\nPlayResY: 180\n\n" +
        "[V4+ Styles]\nFormat: Name, Fontname, Fontsize\nStyle: Default,Sans,20\n\n" +
        "[Events]\nFormat: Layer, Start, End, Style, Text\n",
    );
    render(bin, image(still([0, 0, 0])), undefined, undefined, join(folder, "clip.mp4"));
    writeFileSync(join(folder, "part.ffconcat"), concatList(["clip.mp4"]));
    const portrait = still([255, 0, 0], [40, 40]);
    const output = join(folder, "part.mp4");
    run(
      bin,
      burnPartArgs({ fps }, "part.ffconcat", output, 0, [
        { path: portrait, x: 100, y: 50, size: 80 },
      ]),
      folder,
    );
    expect(streamTags(output)).toBe("yuv420p(tv, bt709, progressive)");
    expectNear(centre(output), [63, 102, 240]);
  });

  it("draws a coloured caption as BT.709 under burn-in", () => {
    const folder = fresh("captions");
    mkdirSync(join(folder, "fonts"), { recursive: true });
    // A red box across the frame as a caption event, so the centre pixel is the script's red.
    const box = `m 0 0 l ${String(width)} 0 ${String(width)} ${String(height)} 0 ${String(height)}`;
    writeFileSync(
      join(folder, "subtitles.ass"),
      serializeAss([], {
        width,
        height,
        fontSize: 20,
        fontName: "Sans",
        overlay: [
          `Dialogue: 0,0:00:00.00,0:00:05.00,Default,,0,0,0,,{\\an7\\pos(0,0)\\bord0\\shad0\\1c&H0000FF&\\p1}${box}{\\p0}`,
        ],
      }),
    );
    render(bin, image(still([0, 0, 0])), undefined, undefined, join(folder, "clip.mp4"));
    writeFileSync(join(folder, "part.ffconcat"), concatList(["clip.mp4"]));
    const output = join(folder, "part.mp4");
    run(bin, burnPartArgs({ fps }, "part.ffconcat", output, 0), folder);
    expect(streamTags(output)).toBe("yuv420p(tv, bt709, progressive)");
    expectNear(centre(output), [63, 102, 240]);
  });
});

describe.skipIf(nvenc === undefined)("a still's colours through NVENC", () => {
  it("encodes BT.709 limited range on the card, tagged so", () => {
    if (nvenc === undefined) return;
    for (const { rgb, bt709: expected } of primaries) {
      const clip = render(system, image(still(rgb)), undefined, nvenc);
      expect(streamTags(clip)).toBe("yuv420p(tv, bt709, progressive)");
      expectNear(centre(clip), expected);
    }
    const sepiaClip = render(system, image(still([0, 255, 0])), graded("sepia"), nvenc);
    expectNear(centre(sepiaClip), bt709(sepia([0, 255, 0])));
  });
});
