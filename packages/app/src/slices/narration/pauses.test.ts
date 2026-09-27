import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegStatic from "ffmpeg-static";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { levelPieces } from "../loudness/level-pieces.js";
import { resolveFfmpeg } from "../video/ffmpeg.js";
import { joinNarration } from "./concat.js";
import {
  applyPauses,
  measurePiece,
  parseSilences,
  planPauses,
  planPieces,
  textBoundaries,
} from "./pauses.js";
import { pauseFields, pausesOfForm } from "./pauses-model.js";

const settings = { sentenceSeconds: 0.5, paragraphSeconds: 0 };

describe("where a text's sentences end", () => {
  it("gives each end but the last, as a share of the text, and paragraph ends", () => {
    const text = "One two. Three four.\n\nFive six.";
    const ends = textBoundaries(text);
    expect(ends.map((one) => one.kind)).toEqual(["sentence", "paragraph"]);
    expect(ends[0]?.ratio).toBeCloseTo(9 / text.length, 5);
    expect(textBoundaries("Only one sentence.")).toEqual([]);
  });
});

describe("the pause plan", () => {
  it("lengthens a short pause after a sentence to the minimum, in its middle", () => {
    const plan = planPauses({
      durationSeconds: 3.3,
      silences: [
        { start: 1, end: 1.15 },
        { start: 2.15, end: 2.3 },
      ],
      boundaries: [
        { ratio: 1 / 3, kind: "sentence" },
        { ratio: 2 / 3, kind: "sentence" },
      ],
      settings,
    });
    expect(plan.inserts).toEqual([
      { at: 1.075, seconds: 0.35 },
      { at: 2.225, seconds: 0.35 },
    ]);
  });

  it("never shortens a pause and never adds one where no quiet is near", () => {
    const plan = planPauses({
      durationSeconds: 10,
      silences: [{ start: 3, end: 3.8 }],
      boundaries: [
        { ratio: 0.3, kind: "sentence" },
        { ratio: 0.9, kind: "sentence" },
      ],
      settings,
    });
    // The first end's pause is already 0.8 s; the second has no quiet stretch near it.
    expect(plan.inserts).toEqual([]);
  });

  it("prefers the longer quiet of a full stop to a comma's breath beside it", () => {
    const plan = planPauses({
      durationSeconds: 4,
      silences: [
        { start: 1.8, end: 1.88 },
        { start: 2.2, end: 2.4 },
      ],
      boundaries: [{ ratio: 0.5, kind: "sentence" }],
      settings,
    });
    expect(plan.inserts).toEqual([{ at: 2.3, seconds: 0.3 }]);
  });

  it("gives a paragraph end the longer of the two minimums", () => {
    const plan = planPauses({
      durationSeconds: 3,
      silences: [{ start: 1.4, end: 1.6 }],
      boundaries: [{ ratio: 0.5, kind: "paragraph" }],
      settings: { sentenceSeconds: 0.4, paragraphSeconds: 1 },
    });
    expect(plan.inserts).toEqual([{ at: 1.5, seconds: 0.8 }]);
  });

  it("reads silencedetect's lines, a stretch left open running to the end", () => {
    expect(
      parseSilences(
        "[silencedetect @ 0x1] silence_start: 0\n[silencedetect @ 0x1] silence_end: 0.12 | silence_duration: 0.12\n[silencedetect @ 0x1] silence_start: 2.5\n",
        3,
      ),
    ).toEqual([
      { start: 0, end: 0.12 },
      { start: 2.5, end: 3 },
    ]);
  });
});

describe("the settings", () => {
  it("default a new run to 0.4 s between sentences and none between paragraphs", () => {
    expect(pausesOfForm({})).toEqual({ sentencePauseSeconds: 0.4 });
    expect(pausesOfForm({ sentencePause: "0", paragraphPause: "1" })).toEqual({
      paragraphPauseSeconds: 1,
    });
  });

  it("refuse a pause out of range or off the step, saying where to change it", () => {
    expect(pauseFields({ sentencePauseSeconds: 2.5 })[0]?.message).toContain(
      "between 0 and 2 seconds",
    );
    expect(pauseFields({ sentencePauseSeconds: 0.33 })).toHaveLength(1);
    expect(pauseFields({ sentencePauseSeconds: 0.45, paragraphPauseSeconds: 1 })).toEqual([]);
  });
});

const bin = resolveFfmpeg(process.env, ffmpegStatic);
const present = existsSync(bin) || bin === "ffmpeg";
const log = { write: (): void => {} };
const signal = new AbortController().signal;
const run = { bin, log, signal };
let scratch = "";

// Three one-second "sentences" of tone with 0.15 s between them, as a TTS mp3 would say
// "One two three. Four five six. Seven eight nine." with barely a breath.
function rushed(name: string, frequency: number): string {
  const path = join(scratch, name);
  const tone = `sine=frequency=${String(frequency)}:duration=1:sample_rate=24000`;
  const gap = "anullsrc=r=24000:cl=mono:d=0.15";
  execFileSync(bin, [
    "-v",
    "error",
    "-y",
    ...["-f", "lavfi", "-i", tone, "-f", "lavfi", "-i", gap],
    ...["-f", "lavfi", "-i", tone, "-f", "lavfi", "-i", gap],
    ...["-f", "lavfi", "-i", tone],
    "-filter_complex",
    "[0:a][1:a][2:a][3:a][4:a]concat=n=5:v=0:a=1,aformat=channel_layouts=mono[a]",
    "-map",
    "[a]",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    path,
  ]);
  return path;
}

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), "slopify-pauses-"));
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

describe.skipIf(!present)("pauses with the bundled ffmpeg", () => {
  it("lengthens 0.15 s gaps between sentences to at least 0.5 s, and moves what follows", async () => {
    const piece = rushed("rushed.mp3", 330);
    const text = "One two three. Four five six. Seven eight nine.";
    const before = await measurePiece(run, piece);
    const plans = await planPieces(run, [{ file: piece, text, next: "end" }], settings);
    expect(plans[0]?.pauses.inserts).toHaveLength(2);
    const paced = await applyPauses(run, [piece], plans, join(scratch, "paced"));
    const after = await measurePiece(run, paced.files[0] as string);
    const inner = (silences: typeof after.silences, duration: number) =>
      silences.filter((one) => one.start > 0.05 && one.end < duration - 0.05);
    const gaps = inner(after.silences, after.durationSeconds);
    expect(gaps).toHaveLength(2);
    for (const gap of gaps) expect(gap.end - gap.start).toBeGreaterThanOrEqual(0.47);
    // Two gaps of about 0.15 s became 0.5 s: the piece is about 0.7 s longer, and the third
    // sentence starts that much later.
    expect(after.durationSeconds - before.durationSeconds).toBeGreaterThan(0.6);
    expect(after.durationSeconds - before.durationSeconds).toBeLessThan(0.8);
    const beforeGaps = inner(before.silences, before.durationSeconds);
    expect((gaps[1]?.end ?? 0) - (beforeGaps[1]?.end ?? 0)).toBeGreaterThan(0.6);
  }, 60_000);

  it("paces the levelled pieces exactly as the plain ones, so what is timed lines up", async () => {
    // The word timing (and every caption, chapter, cut and figure card placed from it) reads
    // the plain join; the video plays the levelled one. Both are paced from one plan.
    const pieces = [rushed("plain-a.mp3", 300), rushed("plain-b.mp3", 420)];
    const text = "One two three. Four five six. Seven eight nine.";
    const plans = await planPieces(
      run,
      pieces.map((file, at) => ({ file, text, next: at === 0 ? "sentence" : "end" })),
      settings,
    );
    const levelled = await levelPieces(run, pieces, join(scratch, "levelled"));
    const join2 = async (files: readonly string[], name: string) => {
      const paced = await applyPauses(run, files, plans, join(scratch, `${name}-paced`));
      return joinNarration(
        { bin, log },
        {
          files: paced.files,
          output: join(scratch, `${name}.mp3`),
          listPath: join(scratch, `${name}.txt`),
          signal,
          reencode: true,
        },
      );
    };
    const plain = await join2(pieces, "plain");
    const level = await join2(levelled.files, "level");
    expect(Math.abs(plain - level)).toBeLessThanOrEqual(30);
  }, 60_000);

  it("pads the gap between two pieces to the minimum and joins them", async () => {
    const first = rushed("first.mp3", 300);
    const second = rushed("second.mp3", 450);
    const text = "One two three. Four five six. Seven eight nine.";
    const plans = await planPieces(
      run,
      [
        { file: first, text, next: "sentence" },
        { file: second, text, next: "end" },
      ],
      settings,
    );
    const paced = await applyPauses(run, [first, second], plans, join(scratch, "two"));
    const joined = join(scratch, "joined.mp3");
    await joinNarration(
      { bin, log },
      {
        files: paced.files,
        output: joined,
        listPath: join(scratch, "list.txt"),
        signal,
        reencode: true,
      },
    );
    const measured = await measurePiece(run, joined);
    const gaps = measured.silences.filter(
      (one) => one.start > 0.05 && one.end < measured.durationSeconds - 0.05,
    );
    // Two inside each piece and one between them, every one at least the minimum.
    expect(gaps).toHaveLength(5);
    for (const gap of gaps) expect(gap.end - gap.start).toBeGreaterThanOrEqual(0.45);
  }, 60_000);
});
