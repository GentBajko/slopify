import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// The sample project's pictures, drawn procedurally with ImageMagick: no model, no stock
// photo, no one's private work. Four scenes for the four parts of the article, each in either
// aspect, plus the thumbnail. Maintainer-only: runs when the sample is rebuilt, never in the
// app.

export type Scene = "harbor" | "scrolls" | "embers" | "disc";
export const scenes: readonly Scene[] = ["harbor", "scrolls", "embers", "disc"];

interface Size {
  readonly w: number;
  readonly h: number;
}

// Deterministic, so rebuilding the sample draws the same pictures.
function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
}

function magick(dir: string, args: readonly string[]): void {
  execFileSync("magick", [...args], { cwd: dir, stdio: ["ignore", "ignore", "inherit"] });
}

const n = (value: number): string => value.toFixed(1);

// Speckles from uniform noise: `keep` is the share of pixels that light up.
function speckles(size: Size, seed: number, keep: number): string[] {
  return [
    "(",
    "-size",
    `${size.w}x${size.h}`,
    "xc:",
    "-seed",
    String(seed),
    "+noise",
    "Random",
    "-channel",
    "R",
    "-separate",
    "+channel",
    "-threshold",
    `${String(100 - keep)}%`,
  ];
}

function harbor(dir: string, { w, h }: Size, out: string, seed: number): void {
  const hz = Math.round(h * (h > w ? 0.62 : 0.6));
  const sh = h - hz;
  const sx = Math.round(w * (0.6 + (seed % 5) * 0.05));
  const tx = Math.round(w * 0.15);
  const unit = Math.min(w, h) / 720;
  magick(dir, [
    "-size",
    `${w}x${hz}`,
    "gradient:#1f3160-#f0a060",
    "(",
    "-size",
    `${w}x${hz}`,
    "xc:",
    "-seed",
    "4",
    "+noise",
    "Random",
    "-colorspace",
    "gray",
    "-resize",
    "5%",
    "-resize",
    `${w}x${hz}!`,
    "-blur",
    "0x30",
    "-auto-level",
    "-motion-blur",
    "0x120+0",
    "-auto-level",
    "-sigmoidal-contrast",
    "6,55%",
    "+level-colors",
    "#000000,#ffb48a",
    ")",
    "-define",
    "compose:args=40",
    "-compose",
    "blend",
    "-composite",
    "(",
    "-size",
    `${w}x${hz}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `circle ${sx},${hz + 6} ${sx},${hz - 30 * unit}`,
    "-blur",
    "0x60",
    "+level-colors",
    "black,#ffc07a",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    "-fill",
    "#fff1d2",
    "-draw",
    `circle ${sx},${n(hz + 8 * unit)} ${sx},${n(hz - 28 * unit)}`,
    "sky.png",
  ]);
  magick(dir, [
    "-size",
    `${w}x${sh}`,
    "gradient:#2a3f63-#060b16",
    ...speckles({ w, h: sh }, 9, 6),
    "-morphology",
    "Dilate",
    "Rectangle:5x1",
    "-motion-blur",
    "0x40+0",
    "-blur",
    "0x0.5",
    "-auto-level",
    "(",
    "-size",
    `${Math.round(w * 0.3)}x${sh}`,
    "gradient:white-#222222",
    "-background",
    "black",
    "-gravity",
    "center",
    "-extent",
    `${w}x${sh}+${Math.round(w / 2 - sx)}+0`,
    "-blur",
    "0x50",
    ")",
    "-gravity",
    "northwest",
    "-compose",
    "multiply",
    "-composite",
    "+level-colors",
    "black,#ffd6a0",
    ")",
    "-compose",
    "screen",
    "-composite",
    "(",
    "-size",
    `${w}x${sh}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `rectangle ${sx - 30 * unit},0 ${sx + 30 * unit},${sh}`,
    "-blur",
    "0x30",
    "-motion-blur",
    "0x20+90",
    "+level-colors",
    "black,#7a5a4a",
    ")",
    "-compose",
    "screen",
    "-composite",
    "sea.png",
  ]);
  const top = hz - 208 * unit;
  magick(dir, [
    "sky.png",
    "sea.png",
    "-append",
    "-fill",
    "#0a1222",
    "-draw",
    `polygon ${n(tx - 24 * unit)},${hz} ${n(tx + 24 * unit)},${hz} ${n(tx + 15 * unit)},${n(top + 40 * unit)} ${n(tx - 15 * unit)},${n(top + 40 * unit)}`,
    "-draw",
    `rectangle ${n(tx - 28 * unit)},${n(top + 30 * unit)} ${n(tx + 28 * unit)},${n(top + 40 * unit)}`,
    "-draw",
    `polygon ${n(tx - 11 * unit)},${n(top + 30 * unit)} ${n(tx + 11 * unit)},${n(top + 30 * unit)} ${n(tx + 7 * unit)},${n(top)} ${n(tx - 7 * unit)},${n(top)}`,
    "(",
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `circle ${tx},${n(top + 14 * unit)} ${tx},${n(top + 8 * unit)}`,
    "-blur",
    "0x16",
    "+level-colors",
    "black,#ffe2a8",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    "-fill",
    "#fff3d6",
    "-draw",
    `circle ${tx},${n(top + 14 * unit)} ${tx},${n(top + 10 * unit)}`,
    "-quality",
    "88",
    out,
  ]);
}

function scrolls(dir: string, { w, h }: Size, out: string, seed: number): void {
  const next = random(seed);
  const portrait = h > w;
  const cols = portrait ? 4 : 8;
  const rows = portrait ? 7 : 4;
  const mx = w * 0.05;
  const my = h * 0.07;
  const cw = (w - 2 * mx) / cols;
  const rh = (h - 2 * my) / rows;
  const shades = ["#e3c595", "#d7b27d", "#ecd3a6", "#c89a63", "#dcb887"];
  const draw: string[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x0 = mx + c * cw + 10;
      const y0 = my + r * rh + 10;
      const x1 = x0 + cw - 20;
      const y1 = y0 + rh - 20;
      draw.push("-fill", "#120a05", "-draw", `rectangle ${n(x0)},${n(y0)} ${n(x1)},${n(y1)}`);
      const rad = 12 + next() * 3;
      const k = Math.floor((x1 - x0 - 6) / (2 * rad));
      const layers = 2 + Math.floor(next() * Math.max(1, Math.min(3, k - 1)));
      const offset = (x1 - x0 - 6 - 2 * rad * k) / 2;
      for (let layer = 0; layer < layers; layer++) {
        const count = k - layer;
        const cy = y1 - rad - 2 - layer * rad * 1.72;
        if (cy - rad < y0 + 4) break;
        for (let i = 0; i < count; i++) {
          const cx = x0 + 3 + rad + layer * rad + offset + i * 2 * rad;
          const shade = shades[Math.floor(next() * shades.length)] ?? "#dcb887";
          const rr = rad * (0.9 + next() * 0.1);
          draw.push(
            "-fill",
            shade,
            "-stroke",
            "#5e3f22",
            "-strokewidth",
            "1.4",
            "-draw",
            `circle ${n(cx)},${n(cy)} ${n(cx + rr)},${n(cy)}`,
            "-fill",
            "none",
            "-stroke",
            "#a47a4a",
            "-strokewidth",
            "1",
            "-draw",
            `circle ${n(cx)},${n(cy)} ${n(cx + rr * 0.6)},${n(cy)}`,
            "-fill",
            "#6e4c2c",
            "-stroke",
            "none",
            "-draw",
            `circle ${n(cx)},${n(cy)} ${n(cx + rr * 0.2)},${n(cy)}`,
          );
        }
      }
    }
  const lx = w * 0.23;
  const ly = h * 0.25;
  magick(dir, [
    "-size",
    `${w}x${h}`,
    "gradient:#4a2e19-#22140a",
    ...draw,
    "(",
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `ellipse ${n(lx + w * 0.05)},${n(ly + h * 0.08)} ${n(w * 0.55)},${n(h * 0.72)} 0,360`,
    "-blur",
    "0x160",
    "-level",
    "0%,70%",
    "+level-colors",
    "#2a1a10,#ffffff",
    ")",
    "-compose",
    "multiply",
    "-composite",
    "-compose",
    "over",
    "(",
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `circle ${n(lx)},${n(ly)} ${n(lx)},${n(ly - h * 0.17)}`,
    "-blur",
    "0x140",
    "+level-colors",
    "black,#ff9c40",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    ...speckles({ w, h }, seed, 0.3),
    "-blur",
    "0x1.1",
    "-level",
    "0%,40%",
    "+level-colors",
    "black,#ffe0b0",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-quality",
    "88",
    out,
  ]);
}

function embers(dir: string, { w, h }: Size, out: string, seed: number): void {
  const ground = Math.round(h * 0.78);
  const portrait = h > w;
  const count = portrait ? 4 : 7;
  const span = w * 0.86;
  const x0 = w * 0.07;
  const step = span / (count - 1);
  const top = Math.round(h * (portrait ? 0.4 : 0.28));
  const broken = (seed % (count - 1)) + 1;
  const cw = Math.min(w, h) * 0.064;
  const draw: string[] = ["-fill", "#0d0706"];
  for (let i = 0; i < count; i++) {
    const cx = x0 + i * step;
    const head = i === broken ? Math.round(h * (portrait ? 0.6 : 0.52)) : top;
    draw.push(
      "-draw",
      `rectangle ${n(cx - cw / 2)},${head} ${n(cx + cw / 2)},${ground}`,
      "-draw",
      `rectangle ${n(cx - cw / 2 - 10)},${ground - 14} ${n(cx + cw / 2 + 10)},${ground}`,
      "-draw",
      i === broken
        ? `polygon ${n(cx - cw / 2)},${head} ${n(cx - 8)},${head - 18} ${n(cx + 6)},${head - 6} ${n(cx + cw / 2)},${head - 22} ${n(cx + cw / 2)},${head}`
        : `rectangle ${n(cx - cw / 2 - 12)},${top - 16} ${n(cx + cw / 2 + 12)},${top}`,
    );
  }
  draw.push(
    "-draw",
    `rectangle ${n(x0 - 40)},${top - 40} ${n(x0 + (portrait ? 1 : 3) * step + 40)},${top - 16}`,
    "-draw",
    `rectangle 0,${ground} ${w},${h}`,
  );
  magick(dir, [
    "-size",
    `${w}x${h}`,
    "gradient:#3a140c-#f58a3c",
    "(",
    "-size",
    `${w}x${h}`,
    "-seed",
    "21",
    "xc:",
    "+noise",
    "Random",
    "-colorspace",
    "gray",
    "-resize",
    "4%",
    "-resize",
    `${w}x${h}!`,
    "-blur",
    "0x24",
    "-auto-level",
    "-motion-blur",
    "0x80+80",
    "-auto-level",
    "+level-colors",
    "black,#ffb070",
    ")",
    "-define",
    "compose:args=45",
    "-compose",
    "blend",
    "-composite",
    "-compose",
    "over",
    "(",
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `ellipse ${n(w * 0.55)},${ground} ${n(w * 0.5)},${n(h * 0.28)} 0,360`,
    "-blur",
    "0x120",
    "+level-colors",
    "black,#ff8a3a",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    ...draw,
    ...speckles({ w, h }, seed, 0.04),
    "-morphology",
    "Dilate",
    "Disk:1.6",
    "(",
    "+clone",
    "-blur",
    "0x5",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-motion-blur",
    "0x3+100",
    "-auto-level",
    "-level",
    "0%,70%",
    "+level-colors",
    "black,#ffc070",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    "(",
    "-size",
    `${Math.round(w * 1.3)}x${Math.round(h * 1.6)}`,
    "radial-gradient:white-#5a2c1c",
    "-gravity",
    "center",
    "-crop",
    `${w}x${h}+0+0`,
    "+repage",
    ")",
    "-gravity",
    "northwest",
    "-compose",
    "multiply",
    "-composite",
    "-quality",
    "88",
    out,
  ]);
}

function disc(dir: string, { w, h }: Size, out: string, seed: number): void {
  const hz = Math.round(h * (h > w ? 0.6 : 0.66));
  const rx = w * (h > w ? 0.62 : 0.34);
  const ry = rx * 0.5;
  const cx = w * 0.56;
  const cy = hz + ry * 0.33;
  const tilt = -6;
  const at = `translate ${n(cx)},${n(cy)} rotate ${String(tilt)}`;
  const lines: string[] = [];
  for (let i = 1; i < 24; i++) {
    const x = -rx + i * ((2 * rx) / 24);
    const t = x / rx;
    const y = -ry * Math.sqrt(Math.max(0, 1 - t * t));
    lines.push("-draw", `${at} line ${n(x)},${n(y)} ${n(x)},0`);
  }
  for (let k = 1; k < 4; k++)
    lines.push("-draw", `${at} ellipse 0,0 ${n((rx * k) / 4)},${n((ry * k) / 4)} 180,360`);
  magick(dir, [
    "-size",
    `${w}x${hz}`,
    "gradient:#0a1230-#46628c",
    ...speckles({ w, h: hz }, seed, 0.07),
    "(",
    "+clone",
    "-blur",
    "0x1.4",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-auto-level",
    "-level",
    "0%,85%",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    "(",
    "-size",
    `${w}x${h - hz}`,
    "gradient:#1b2a4a-#04070f",
    ")",
    "-append",
    "(",
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `ellipse ${n(cx)},${hz} ${n(rx * 1.25)},${n(h * 0.16)} 180,360`,
    "-blur",
    "0x80",
    "+level-colors",
    "black,#d99a66",
    ")",
    "-compose",
    "screen",
    "-composite",
    "-compose",
    "over",
    "background.png",
  ]);
  magick(dir, [
    "-size",
    `${w}x${h}`,
    "xc:black",
    "-fill",
    "white",
    "-draw",
    `${at} ellipse 0,0 ${n(rx)},${n(ry)} 180,360`,
    "-fill",
    "black",
    "-draw",
    `rectangle 0,${hz} ${w},${h}`,
    "mask.png",
  ]);
  magick(dir, [
    "-size",
    `${w}x${h}`,
    "gradient:#d8e2ec-#5d7390",
    "-fill",
    "none",
    "-stroke",
    "#5d7390",
    "-strokewidth",
    "1.3",
    ...lines,
    "mask.png",
    "-alpha",
    "off",
    "-compose",
    "copy_opacity",
    "-composite",
    "disc.png",
  ]);
  magick(dir, [
    "background.png",
    "disc.png",
    "-compose",
    "over",
    "-composite",
    ...speckles({ w, h: h - hz }, 9, 1.5),
    "-morphology",
    "Dilate",
    "Rectangle:7x1",
    "-motion-blur",
    "0x30+0",
    "-auto-level",
    "-level",
    "0%,300%",
    "+level-colors",
    "black,#8a6a58",
    ")",
    "-geometry",
    `+0+${String(hz)}`,
    "-compose",
    "screen",
    "-composite",
    "-quality",
    "88",
    out,
  ]);
}

// One scene as JPEG bytes, 1280×720, 720×1280 or 960×960; the seed varies its details.
export function drawScene(scene: Scene, aspect: "16:9" | "9:16" | "1:1", seed: number): Uint8Array {
  const size =
    aspect === "16:9"
      ? { w: 1280, h: 720 }
      : aspect === "1:1"
        ? { w: 960, h: 960 }
        : { w: 720, h: 1280 };
  const dir = mkdtempSync(join(process.env.SAMPLE_SCRATCH ?? "/tmp", "sample-art-"));
  try {
    const out = join(dir, "out.jpg");
    if (scene === "harbor") harbor(dir, size, out, seed);
    else if (scene === "scrolls") scrolls(dir, size, out, seed);
    else if (scene === "embers") embers(dir, size, out, seed);
    else disc(dir, size, out, seed);
    return readFileSync(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
