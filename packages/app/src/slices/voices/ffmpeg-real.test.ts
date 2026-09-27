import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Log } from "../../kernel/log.js";
import { joinTurns } from "../rebuild/runtime-local.js";
import { concatList, joinArgs, runFfmpeg } from "../video/ffmpeg.js";
import { audioChapters, audioFileArgs, ffmetadata } from "./audio-files.js";
import { panelTiles } from "./panel.js";

// The multi-voice audio steps against the real bundled ffmpeg, with no provider in sight: three
// sine-tone "turns" at different pitches and sample rates stand in for three speakers. Skipped
// where the binary is missing (npm skipped ffmpeg-static's download).
const bin = typeof ffmpegStatic === "string" && existsSync(ffmpegStatic) ? ffmpegStatic : null;
const log: Log = { write: () => undefined };

let dir = "";
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "slopify-voices-ffmpeg-"));
});
afterAll(() => {
  if (dir !== "") rmSync(dir, { recursive: true, force: true });
});

function ffmpeg(args: readonly string[], cwd?: string): { stdout: Buffer; stderr: string } {
  const result = spawnSync(bin ?? "ffmpeg", ["-hide_banner", "-nostdin", ...args], {
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { stdout: result.stdout, stderr: result.stderr.toString("utf8") };
}
function tone(name: string, frequency: number, rate: number, seconds: number): string {
  const path = join(dir, name);
  ffmpeg([
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${String(frequency)}:sample_rate=${String(rate)}:duration=${String(seconds)}`,
    "-ac",
    "1",
    "-y",
    path,
  ]);
  return path;
}
// `ffmpeg -i` with no output prints the container's duration and exits non-zero; that line is
// the probe.
function duration(path: string): number {
  const match = /Duration: (\d+):(\d+):(\d+(?:\.\d+)?)/.exec(ffmpeg(["-i", path]).stderr);
  if (match === null) throw new Error(`No duration for ${path}`);
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}
function chaptersOf(path: string): { title: string; start: number; end: number }[] {
  const text = ffmpeg(["-i", path, "-f", "ffmetadata", "-"]).stdout.toString("utf8");
  return text
    .split("[CHAPTER]")
    .slice(1)
    .map((block) => {
      const field = (name: string): string =>
        new RegExp(`^${name}=(.*)$`, "m").exec(block)?.[1] ?? "";
      const [num, den] = field("TIMEBASE").split("/").map(Number);
      const scale = (num ?? 1) / (den ?? 1000);
      return {
        title: field("title"),
        start: Number(field("START")) * scale,
        end: Number(field("END")) * scale,
      };
    });
}
function silences(path: string): { start: number; end: number }[] {
  const { stderr } = ffmpeg([
    "-i",
    path,
    "-af",
    "silencedetect=noise=-40dB:d=0.2",
    "-f",
    "null",
    "-",
  ]);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  return starts.map((start, at) => ({ start, end: ends[at] ?? Number.NaN }));
}

describe.skipIf(bin === null)("multi-voice audio with the real ffmpeg", () => {
  const run = () => ({ bin: bin ?? "", log, signal: new AbortController().signal });

  it("joins turns at each speaker's pace with the gap between turns, then writes MP3 and M4B with chapters", async () => {
    // Different providers give different sample rates; the join brings them to one.
    const turns = [
      tone("ada.wav", 330, 24000, 0.6),
      tone("ben.wav", 440, 44100, 0.8),
      tone("cy.wav", 660, 22050, 0.5),
    ];
    // The concat-turns-v1 recipe's values: the template, then [pace, gap after] per part.
    const layout = [
      [1, 0.35],
      [1.25, 0.35],
      [0.8, 0],
    ];
    const joined = join(dir, "narration.mp3");
    const measured = await joinTurns(run(), turns, [["template"], layout], joined);
    const expected = 0.6 + 0.35 + 0.8 / 1.25 + 0.35 + 0.5 / 0.8;
    expect(measured / 1000).toBeCloseTo(expected, 1);
    expect(Math.abs(duration(joined) - expected)).toBeLessThan(0.1);
    // The two gaps are silence where the layout put them.
    const gaps = silences(joined);
    expect(gaps).toHaveLength(2);
    expect(gaps[0]?.start).toBeCloseTo(0.6, 1);
    expect((gaps[0]?.end ?? 0) - (gaps[0]?.start ?? 0)).toBeCloseTo(0.35, 1);
    expect(gaps[1]?.start).toBeCloseTo(0.6 + 0.35 + 0.64, 1);

    // The listening files: lead-in silence, the joined turns, a tail, and a chapter per section.
    const edge = 0.5;
    const audio = [
      { path: null, seconds: edge },
      { path: joined, seconds: measured / 1000 },
      { path: null, seconds: edge },
    ];
    const totalSeconds = audio.reduce((sum, segment) => sum + segment.seconds, 0);
    const chapters = audioChapters({
      title: "Tones",
      sections: [
        { title: "Opening", firstTurn: 1 },
        { title: "The debate", firstTurn: 2 },
      ],
      turnStarts: new Map([
        [1, edge],
        [2, edge + 0.95],
      ]),
      totalSeconds,
    });
    const metadata = join(dir, "chapters.txt");
    writeFileSync(metadata, ffmetadata("Tones", chapters));
    for (const kind of ["mp3", "m4b"] as const) {
      const output = join(dir, `audiobook.${kind}`);
      await runFfmpeg({
        ...run(),
        args: audioFileArgs(audio, metadata, output, kind),
        onProgress: () => undefined,
      });
      expect(Math.abs(duration(output) - totalSeconds)).toBeLessThan(0.15);
      const found = chaptersOf(output);
      expect(found.map((one) => one.title)).toEqual(["Opening", "The debate"]);
      expect(found[0]?.start).toBeCloseTo(0, 2);
      // Within a frame of the MP3 encoder's delay, which ffmpeg takes off as it reads.
      expect(found[1]?.start).toBeCloseTo(edge + 0.95, 1);
      expect(found[1]?.end).toBeCloseTo(totalSeconds, 1);
    }
  }, 30_000);

  it("lays a portrait into its speaker panel tile and leaves the rest of the frame alone", async () => {
    const work = join(dir, "render");
    mkdirSync(join(work, "fonts"), { recursive: true });
    // A blue one-second clip, and a wide red picture that must be cropped square.
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=blue:s=1920x1080:d=1:r=25",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-y",
      join(work, "c0.mp4"),
    ]);
    ffmpeg([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:s=160x90",
      "-frames:v",
      "1",
      "-y",
      join(work, "portrait-0.png"),
    ]);
    writeFileSync(
      join(work, "subtitles.ass"),
      "[Script Info]\nScriptType: v4.00+\nPlayResX: 1920\nPlayResY: 1080\n\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n",
    );
    const list = join(work, "slides.ffconcat");
    writeFileSync(list, concatList(["c0.mp4"]));
    const [tile, other] = panelTiles(2, { width: 1920, height: 1080 });
    if (tile === undefined || other === undefined) throw new Error("Expected two tiles.");
    const output = join(work, "video.mp4");
    await runFfmpeg({
      ...run(),
      cwd: work,
      args: joinArgs({ audio: [] }, output, list, true, [
        { path: "portrait-0.png", x: tile.x, y: tile.y, size: tile.size },
      ]),
      onProgress: () => undefined,
    });
    // A 2x2 crop (yuv420p cannot crop one pixel), read back as RGB; the first pixel is enough.
    const pixel = (x: number, y: number): readonly number[] => [
      ...ffmpeg([
        "-i",
        output,
        "-vf",
        `crop=2:2:${String(x)}:${String(y)}`,
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ]).stdout.subarray(0, 3),
    ];
    const red = ([r = 0, g = 0, b = 0]: readonly number[]): boolean => r > 180 && g < 80 && b < 80;
    const blue = ([r = 0, g = 0, b = 0]: readonly number[]): boolean => b > 180 && r < 80 && g < 80;
    // Both corners of the tile are covered: the picture was scaled up and cropped square.
    expect(red(pixel(tile.x + 3, tile.y + 3))).toBe(true);
    expect(red(pixel(tile.x + tile.size - 4, tile.y + tile.size - 4))).toBe(true);
    expect(blue(pixel(tile.x + tile.size + 5, tile.y + 3))).toBe(true);
    // The second speaker has no portrait; their tile is the caption file's to draw.
    expect(blue(pixel(other.x + 3, other.y + 3))).toBe(true);
    // The whole clip still plays: the still picture is held, not the end of the video.
    expect(duration(output)).toBeCloseTo(1, 1);
  }, 30_000);
});
