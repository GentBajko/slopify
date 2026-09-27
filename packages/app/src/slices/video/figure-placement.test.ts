import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { shortEditList } from "../shorts/render.js";
import { resolveFfmpeg } from "./ffmpeg.js";
import { passageSpans } from "./figure-spans.js";
import { figureFrames, fps, type PlanInput, planRender } from "./plan.js";
import { renderSlideshow } from "./slideshow.js";

// "Show tables and figures on screen": a card is shown exactly while its description is
// spoken, found in the word timing; the images take turns around it.

const timed = (text: string, from: number, each = 0.4): TimedWord[] =>
  text.split(" ").map((word, at) => ({
    text: word,
    start: from + at * each,
    end: from + at * each + each * 0.8,
  }));

describe("passageSpans", () => {
  it("finds each description in the word timing, in order", () => {
    const words = [
      ...timed("Tides differ by port.", 0.5),
      ...timed("Brest has the larger range, seven metres against Dover's six.", 2.5),
      ...timed("That is all.", 7),
      ...timed("A map shows the range growing towards the west.", 9),
    ];
    const spans = passageSpans(words, [
      "Brest has the larger range, 7 metres against Dover's six.",
      "A map shows the range growing towards the west.",
    ]);
    expect(spans[0]?.start).toBeCloseTo(2.5);
    // The last word "six." starts at 2.5 + 9 * 0.4 = 6.1 and ends 0.32 later.
    expect(spans[0]?.end).toBeCloseTo(6.42);
    expect(spans[1]?.start).toBeCloseTo(9);
    expect(spans[1]?.end).toBeCloseTo(9 + 8 * 0.4 + 0.32);
  });

  it("leaves out a description the timing does not have", () => {
    expect(passageSpans(timed("Something else entirely.", 0), ["A table of ports."])).toEqual([
      undefined,
    ]);
  });
});

describe("figureFrames", () => {
  it("adds the lead-in and tail and gives short gaps to the card", () => {
    expect(
      figureFrames(
        [
          { path: "a.png", start: 2, end: 4 },
          { path: "b.png", start: 4.9, end: 6 },
        ],
        300,
      ),
    ).toEqual([
      // 1.7 s to 4.3 s, then held to the next card, which starts 0.3 s before 4.9 s.
      { path: "a.png", startFrame: 51, frames: 138 - 51 },
      { path: "b.png", startFrame: 138, frames: 189 - 138 },
    ]);
  });
});

const input = (over: Partial<PlanInput>): PlanInput => ({
  format: "16:9",
  gapSeconds: 0,
  edgeSeconds: 0,
  imageSeconds: 2,
  zoomPercent: 0,
  motionStyle: "still",
  body: { path: "body.wav", seconds: 10 },
  images: ["one.png", "two.png", "three.png"],
  output: "video.mp4",
  ...over,
});

describe("planRender with cards", () => {
  it("shows the card for its span and lets the images take turns around it", () => {
    const plan = planRender(
      input({ edit: { figures: [{ path: "card.png", start: 3.3, end: 5.7 }] } }),
    );
    const shots = plan.editList.shots;
    expect(shots.reduce((sum, shot) => sum + shot.frames, 0)).toBe(300);
    const at = shots.findIndex((shot) => shot.source.path === "card.png");
    const before = shots.slice(0, at).reduce((sum, shot) => sum + shot.frames, 0);
    // From 3.0 s (0.3 s before its description) to 6.0 s.
    expect(before).toBe(90);
    expect(shots[at]?.frames).toBe(90);
    expect(shots[at]?.motion).toEqual({ kind: "still" });
    // The images keep their turns across the card: one, two, card, three, one.
    expect(shots.map((shot) => shot.source.path)).toEqual([
      "one.png",
      "two.png",
      "card.png",
      "three.png",
      "one.png",
    ]);
  });

  it("plans exactly as before without cards", () => {
    const plain = planRender(input({}));
    expect(planRender(input({ edit: { figures: [] } })).editList.shots).toEqual(
      plain.editList.shots,
    );
  });
});

describe("a short with a card", () => {
  it("shows the upright card on the short's own timeline", () => {
    const edit = shortEditList({
      audioPath: "clip.wav",
      seconds: 12,
      images: ["a.png", "b.png"],
      imageSeconds: 4,
      motionStyle: "still",
      zoomPercent: 0,
      figures: [{ path: "card-9x16.png", start: 5, end: 8 }],
    });
    expect(edit.width).toBe(1080);
    expect(edit.shots.map((shot) => [shot.source.path, shot.frames])).toEqual([
      ["a.png", 120],
      ["b.png", 21],
      ["card-9x16.png", Math.round(8.3 * fps) - Math.round(4.7 * fps)],
      ["a.png", 360 - Math.round(8.3 * fps)],
    ]);
  });
});

// A real render with the bundled ffmpeg: the card's colour is on screen exactly while its
// description is spoken, and the images before and after it.
describe("rendered", () => {
  const bin = resolveFfmpeg(process.env, ffmpegStatic);
  let scratch = "";
  const make = (name: string, args: readonly string[]): string => {
    const path = join(scratch, name);
    execFileSync(bin, ["-v", "error", "-y", ...args, path]);
    return path;
  };
  beforeAll(() => {
    scratch = mkdtempSync(join(tmpdir(), "slopify-card-render-"));
    make("red.png", ["-f", "lavfi", "-i", "color=c=0xc03030:s=320x180", "-frames:v", "1"]);
    make("card.png", ["-f", "lavfi", "-i", "color=c=0x19191c:s=1920x1080", "-frames:v", "1"]);
    make("tone.wav", ["-f", "lavfi", "-i", "sine=frequency=440:duration=4"]);
  });
  afterAll(() => rmSync(scratch, { recursive: true, force: true }));

  it("puts the card on screen for its span", async () => {
    const output = join(scratch, "video.mp4");
    const plan = planRender(
      input({
        body: { path: join(scratch, "tone.wav"), seconds: 4 },
        images: [join(scratch, "red.png")],
        output,
        edit: { figures: [{ path: join(scratch, "card.png"), start: 1.3, end: 2.7 }] },
      }),
    );
    await renderSlideshow({
      bin,
      edit: plan.editList,
      output,
      burnSubtitles: false,
      scratch,
      signal: new AbortController().signal,
      log: { write: () => undefined },
      onProgress: () => undefined,
    });
    const pixel = (frame: number): number[] => {
      const raw = execFileSync(bin, [
        ...["-hide_banner", "-loglevel", "error", "-i", output],
        ...["-vf", `select=eq(n\\,${String(frame)}),scale=16:9:flags=area`, "-frames:v", "1"],
        ...["-pix_fmt", "rgb24", "-f", "rawvideo", "-"],
      ]);
      const at = (4 * 16 + 8) * 3;
      return [raw[at] ?? 0, raw[at + 1] ?? 0, raw[at + 2] ?? 0];
    };
    // Red before 1.0 s and after 3.0 s; the card's graphite from 1.0 s to 3.0 s.
    expect(pixel(15)[0]).toBeGreaterThan(150);
    expect(pixel(45)[0]).toBeLessThan(50);
    expect(pixel(85)[0]).toBeLessThan(50);
    expect(pixel(100)[0]).toBeGreaterThan(150);
    const frames = spawnSync(
      bin,
      ["-hide_banner", "-i", output, "-map", "0:v", "-f", "null", "-"],
      {
        encoding: "utf8",
      },
    ).stderr;
    expect([...frames.matchAll(/frame=\s*(\d+)/g)].at(-1)?.[1]).toBe("120");
  }, 60_000);
});
