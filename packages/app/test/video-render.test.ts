import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import { ulidIds } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import type { Paths } from "../src/kernel/paths.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { renderVideo } from "../src/slices/video/run.js";

const log: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const width = 1920;
const height = 1080;

interface Fixture {
  readonly db: DatabaseSync;
  readonly paths: Paths;
  readonly dir: string;
  readonly projectId: string;
  readonly counted: Counted;
}

function ff(args: readonly string[]): string {
  try {
    execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" });
    return "";
  } catch (error) {
    // `ffmpeg -i file` with no output is an error by design; its report is on stderr.
    return String((error as { stderr?: string }).stderr ?? "");
  }
}

// A black frame with a centred white rectangle of a known width, so the zoom the render
// applied can be read straight off a decoded frame.
function marker(path: string, source: number, rectangle: number, tall: number): void {
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=black:s=${source}x${tall}:d=1`,
    "-f",
    "lavfi",
    "-i",
    `color=white:s=${rectangle}x${Math.round(tall / 4)}:d=1`,
    "-filter_complex",
    "[0][1]overlay=(W-w)/2:(H-h)/2",
    "-frames:v",
    "1",
    path,
  ]);
}

function tone(path: string, hz: number, seconds: number): void {
  ff([
    "-v",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    `sine=frequency=${hz}:duration=${seconds}:sample_rate=44100`,
    "-ac",
    "2",
    path,
  ]);
}

// The width of the white rectangle in the finished frame, in output pixels.
function rectangleWidthAt(video: string, at: number): number {
  const raw = execFileSync(
    ffmpeg,
    [
      "-v",
      "error",
      "-ss",
      at.toFixed(3),
      "-i",
      video,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "gray",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
  const row = raw.subarray((height >> 1) * width, (height >> 1) * width + width);
  let bright = 0;
  for (const value of row) {
    if (value > 128) {
      bright += 1;
    }
  }
  return bright;
}

function durationSecondsOf(video: string): number {
  const reported = ff(["-hide_banner", "-i", video]);
  const matched = /Duration: (\d\d):(\d\d):(\d\d\.\d\d)/.exec(reported);
  if (matched === null) {
    throw new Error(`ffmpeg -i reported no duration:\n${reported}`);
  }
  return Number(matched[1]) * 3600 + Number(matched[2]) * 60 + Number(matched[3]);
}

interface FixtureOptions {
  readonly gapSeconds?: number;
  readonly withEnds?: boolean;
  readonly brokenImage?: boolean;
}

function fixture(options: FixtureOptions = {}): Fixture {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-render-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  const projectId = "p1";
  const dir = join(paths.projects, projectId);
  mkdirSync(join(dir, "images"), { recursive: true });

  const config = { silenceGapSeconds: options.gapSeconds ?? 0.5 };
  db.prepare("INSERT INTO projects VALUES (?, ?, ?, ?, ?, ?)").run(
    projectId,
    "Rope Tricks",
    "16:9",
    JSON.stringify({
      title: "Rope Tricks",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "provide",
        thumbnail: "off",
        video: "generate",
      },
      imagePrompts: [],
      values: {},
      provided: {},
      rendered: {},
      ...config,
    }),
    "2026-09-02T10:00:00.000Z",
    "2026-09-02T10:00:00.000Z",
  );
  db.prepare(
    "INSERT INTO stages (id, project_id, kind, source, state) VALUES ('s-video', ?, 'video', 'generate', 'running')",
  ).run(projectId);

  // Rectangles of 200, 160 and 120 source pixels on 640-wide frames scale to 600, 480
  // and 360 output pixels at zoom 1.0, which is what the assertions below read back.
  marker(join(dir, "images", "001.png"), 640, 200, 360);
  marker(join(dir, "images", "002.png"), 640, 160, 360);
  // A square source, so the cover-and-crop is exercised too.
  marker(join(dir, "images", "003.png"), 360, 120, 360);
  tone(join(dir, "audio-body.mp3"), 440, 1);
  if (options.withEnds === true) {
    tone(join(dir, "audio-intro.mp3"), 300, 0.5);
    tone(join(dir, "audio-outro.mp3"), 600, 0.5);
  }

  const insert = db.prepare(
    "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES (?, ?, ?, ?, ?, 1, ?, '2026-09-02T10:00:00.000Z')",
  );
  insert.run("o-body", projectId, "audio", "audio_body", "audio-body.mp3", "{}");
  if (options.withEnds === true) {
    insert.run("o-intro", projectId, "audio", "audio_intro", "audio-intro.mp3", "{}");
    insert.run("o-outro", projectId, "audio", "audio_outro", "audio-outro.mp3", "{}");
  }
  for (const index of [1, 2, 3]) {
    insert.run(
      `o-image-${index}`,
      projectId,
      "images",
      "image",
      options.brokenImage === true && index === 2 ? "article.txt" : `images/00${index}.png`,
      JSON.stringify({ index }),
    );
  }
  if (options.brokenImage === true) {
    ff([
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=black:s=2x2:d=1",
      "-frames:v",
      "1",
      join(dir, "article.txt"),
    ]);
    // Overwrite the png header with text so ffmpeg cannot decode it.
    execFileSync("sh", [
      "-c",
      `printf 'not an image' > ${JSON.stringify(join(dir, "article.txt"))}`,
    ]);
  }
  return { db, paths, dir, projectId, counted: recordingCounter() };
}

function context(signal: AbortSignal, events: unknown[]): StageContext {
  return {
    stage: { id: "s-video", projectId: "p1", kind: "video", state: "running" },
    signal,
    emit: (event): void => {
      events.push(event);
    },
  };
}

function deps(harness: Fixture): Parameters<typeof renderVideo>[0] {
  return {
    db: harness.db,
    paths: harness.paths,
    ids: ulidIds,
    clock: systemClock,
    log,
    ffmpeg,
    count: harness.counted.count,
  };
}

function rowsOf(db: DatabaseSync): unknown[] {
  return db
    .prepare("SELECT role, path FROM outputs WHERE stage_kind = 'video' ORDER BY rowid")
    .all();
}

function idsOf(db: DatabaseSync): unknown[] {
  return db.prepare("SELECT id FROM outputs WHERE stage_kind = 'video' ORDER BY rowid").all();
}

describe("the ffmpeg render", () => {
  it("renders the slideshow over the audio, gaps included, and records the plan", async () => {
    const harness = fixture({ withEnds: true, gapSeconds: 0.5 });
    const events: unknown[] = [];

    await renderVideo(deps(harness), context(new AbortController().signal, events));

    const video = join(harness.dir, "video.mp4");
    expect(existsSync(video)).toBe(true);
    // 0.5 intro + 0.5 gap + 1 body + 0.5 gap + 0.5 outro.
    expect(durationSecondsOf(video)).toBeCloseTo(3, 1);

    const plan = JSON.parse(readFileSync(join(harness.dir, "render.json"), "utf8")) as {
      audio: Array<{ kind: string; path: string | null; seconds: number }>;
      images: Array<{ path: string; frames: number; zoom: string }>;
      output: string;
    };
    expect(plan.audio.map((segment) => segment.kind)).toEqual([
      "intro",
      "gap",
      "body",
      "gap",
      "outro",
    ]);
    expect(plan.images.map((slot) => slot.zoom)).toEqual(["in", "out", "in"]);
    expect(plan.images.map((slot) => slot.path)).toEqual([
      "images/001.png",
      "images/002.png",
      "images/003.png",
    ]);
    expect(plan.output).toBe("video.mp4");

    const rows = harness.db
      .prepare("SELECT role, path FROM outputs WHERE stage_kind = 'video' ORDER BY rowid")
      .all();
    expect(rows).toEqual([
      { role: "render_params", path: "render.json" },
      { role: "video", path: "video.mp4" },
    ]);
    expect(events.at(-1)).toEqual({
      type: "stage.progress",
      projectId: "p1",
      stage: "video",
      current: 3000,
      total: 3000,
    });
    // A page loaded after the render reads the row, not the events it missed, so the row
    // has to agree with the last one that went out.
    expect(harness.db.prepare("SELECT progress_current, progress_total FROM stages").get()).toEqual(
      { progress_current: 3000, progress_total: 3000 },
    );
    // Videos rendered (completed renders). One event, no provider: ffmpeg is the machine's own
    // binary, not a service with a model name.
    expect(harness.counted.events()).toEqual([
      { type: "stage.completed", counters: { stage: "video" } },
    ]);
  }, 180_000);

  it("zooms the first image in and the second one out", async () => {
    const harness = fixture();
    await renderVideo(deps(harness), context(new AbortController().signal, []));
    const video = join(harness.dir, "video.mp4");

    // 1 s of audio is 30 frames over three images, so each image holds 10 frames:
    // image 1 spans 0.000-0.300 s and image 2 spans 0.333-0.633 s.
    const firstStart = rectangleWidthAt(video, 0);
    const firstEnd = rectangleWidthAt(video, 0.3);
    const secondStart = rectangleWidthAt(video, 0.34);
    const secondEnd = rectangleWidthAt(video, 0.63);

    // A 200 px rectangle on a 640 px source is 600 px in a 1920 px frame at zoom 1.
    expect(firstStart).toBe(600);
    expect(firstEnd / firstStart).toBeCloseTo(1.15, 1);
    expect(firstEnd).toBeGreaterThan(firstStart);

    // A 160 px rectangle is 480 px at zoom 1, so it starts at 1.15 and ends at 1.
    expect(secondStart / 480).toBeCloseTo(1.15, 1);
    expect(secondEnd).toBeCloseTo(480, -1);
    expect(secondEnd).toBeLessThan(secondStart);
  }, 180_000);

  it("surfaces ffmpeg's own words when the render fails, and keeps no partial file", async () => {
    const harness = fixture({ brokenImage: true });

    await expect(
      renderVideo(deps(harness), context(new AbortController().signal, [])),
    ).rejects.toThrow(/ffmpeg exited with code \d+: .+/);

    expect(existsSync(join(harness.dir, "video.mp4"))).toBe(false);
    expect(
      harness.db.prepare("SELECT count(*) AS n FROM outputs WHERE role = 'video'").get(),
    ).toEqual({ n: 0 });
    // A render that failed is not a completed render, so it counts nothing.
    expect(harness.counted.events()).toEqual([]);
  }, 180_000);

  it("kills the render when the stage is canceled and leaves nothing behind", async () => {
    const harness = fixture();
    const controller = new AbortController();

    const running = renderVideo(deps(harness), context(controller.signal, []));
    setTimeout(() => {
      controller.abort();
    }, 150);

    await expect(running).rejects.toThrow(/canceled|abort/i);
    expect(existsSync(join(harness.dir, "video.mp4"))).toBe(false);
    // The aborted render counts nothing either.
    expect(harness.counted.events()).toEqual([]);
    // Nothing is stored for a render that was cancelled, whichever guard caught it.
    expect(
      harness.db.prepare("SELECT count(*) AS n FROM outputs WHERE stage_kind = 'video'").get(),
    ).toEqual({ n: 0 });
  }, 180_000);

  it("stores nothing when the cancel lands after ffmpeg has already exited", async () => {
    const harness = fixture();
    const controller = new AbortController();
    // Aborted before renderVideo is entered: the render never reaches the point where a
    // stored output would be protected, so no row and no file may appear.
    controller.abort();

    await expect(renderVideo(deps(harness), context(controller.signal, []))).rejects.toThrow(
      /canceled|abort/i,
    );

    expect(existsSync(join(harness.dir, "video.mp4"))).toBe(false);
    expect(existsSync(join(harness.dir, "render.json"))).toBe(false);
    expect(
      harness.db.prepare("SELECT count(*) AS n FROM outputs WHERE stage_kind = 'video'").get(),
    ).toEqual({ n: 0 });
  }, 60_000);

  // The previous video stays downloadable until the new render finishes. The render writes
  // beside the finished file and swaps only once ffmpeg has exited cleanly, so neither a
  // failure nor a cancel can take the old one away.
  it("leaves the previous video whole when the new render fails", async () => {
    const harness = fixture();
    await renderVideo(deps(harness), context(new AbortController().signal, []));
    const video = join(harness.dir, "video.mp4");
    const before = readFileSync(video);
    const params = readFileSync(join(harness.dir, "render.json"), "utf8");
    // The image the second render would read is replaced with something undecodable.
    writeFileSync(join(harness.dir, "images", "002.png"), "not an image");

    await expect(
      renderVideo(deps(harness), context(new AbortController().signal, [])),
    ).rejects.toThrow(/ffmpeg exited with code \d+/);

    expect(readFileSync(video)).toEqual(before);
    expect(readFileSync(join(harness.dir, "render.json"), "utf8")).toBe(params);
    // Only the first render finished, so only the first was counted.
    expect(harness.counted.events()).toHaveLength(1);
    expect(rowsOf(harness.db)).toEqual([
      { role: "render_params", path: "render.json" },
      { role: "video", path: "video.mp4" },
    ]);
    // The half-written render is not left beside the good one for the download route to
    // find, and the boot reconcile has nothing to collect.
    expect(existsSync(join(harness.dir, "video.part.mp4"))).toBe(false);
  }, 180_000);

  it("leaves the previous video whole when the new render is canceled", async () => {
    const harness = fixture();
    await renderVideo(deps(harness), context(new AbortController().signal, []));
    const video = join(harness.dir, "video.mp4");
    const before = readFileSync(video);
    const controller = new AbortController();

    const running = renderVideo(deps(harness), context(controller.signal, []));
    setTimeout(() => {
      controller.abort();
    }, 150);
    await expect(running).rejects.toThrow(/canceled|abort/i);

    expect(readFileSync(video)).toEqual(before);
    expect(rowsOf(harness.db)).toEqual([
      { role: "render_params", path: "render.json" },
      { role: "video", path: "video.mp4" },
    ]);
    expect(existsSync(join(harness.dir, "video.part.mp4"))).toBe(false);
  }, 180_000);

  // The other half of it: a project never keeps two outputs for one stage once an action
  // completes. The swap replaces the file and the row that named it.
  it("replaces the previous video when the new render finishes", async () => {
    const harness = fixture();
    await renderVideo(deps(harness), context(new AbortController().signal, []));
    const before = readFileSync(join(harness.dir, "video.mp4"));
    const firstIds = idsOf(harness.db);
    // A longer body, so the second render cannot produce the same bytes as the first.
    tone(join(harness.dir, "audio-body.mp3"), 440, 2);
    harness.db.prepare("UPDATE outputs SET duration_ms = NULL WHERE role = 'audio_body'").run();

    await renderVideo(deps(harness), context(new AbortController().signal, []));

    expect(readFileSync(join(harness.dir, "video.mp4"))).not.toEqual(before);
    expect(rowsOf(harness.db)).toEqual([
      { role: "render_params", path: "render.json" },
      { role: "video", path: "video.mp4" },
    ]);
    expect(idsOf(harness.db)).not.toEqual(firstIds);
    expect(existsSync(join(harness.dir, "video.part.mp4"))).toBe(false);
    // Scenario 12: "regenerations count again", so the second render is a second event.
    expect(harness.counted.events()).toHaveLength(2);
  }, 180_000);

  it("refuses to render a project whose audio decodes to nothing", async () => {
    const harness = fixture();
    harness.db.prepare("UPDATE outputs SET duration_ms = 0 WHERE role = 'audio_body'").run();

    await expect(
      renderVideo(deps(harness), context(new AbortController().signal, [])),
    ).rejects.toThrow(/no sound/);
  }, 60_000);
});
