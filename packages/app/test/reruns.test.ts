import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import type { FakeImage } from "../src/adapters/fake/image.js";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import type { FakeTts } from "../src/adapters/fake/tts.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { ProjectEvent } from "../src/kernel/events.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import { derive } from "../src/kernel/runner/graph.js";
import type { Runner } from "../src/kernel/runner/index.js";
import { createRunner } from "../src/kernel/runner/index.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import type { RunDraft } from "../src/slices/admission/model.js";
import { claimStage, finishStage, stagesOf } from "../src/slices/admission/repo.js";
import { startRun } from "../src/slices/admission/start.js";
import { runArticle } from "../src/slices/article/run.js";
import { runImages } from "../src/slices/images/run.js";
import { runNarration } from "../src/slices/narration/run.js";
import { deleteImage, editArticle } from "../src/slices/reruns/index.js";
import { outputsOf } from "../src/slices/storage/repo.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { renderVideo } from "../src/slices/video/run.js";

// `logic/12` end to end: a run made by the real stages, then an edit and a delete on it,
// each cascading through the real runner to a fresh render by the real bundled ffmpeg. No
// provider is called; `adapters/fake/*` are the scripted doubles (06-testing).

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const written = "# Rope\n\nRope is older than writing.";
const edited = "# Knots\n\nKnots hold fast under load.";

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"] });
}

// A still and a tone, made once by the binary the render uses. The tone's pitch is taken
// from the text it speaks, so audio made from a different article is different bytes.
const scratch = mkdtempSync(join(tmpdir(), "slopify-rerun-fixtures-"));

function still(): Uint8Array {
  const path = join(scratch, "still.png");
  if (!existsSync(path)) {
    ff([
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=320x180:rate=1:duration=1",
      "-frames:v",
      "1",
      path,
    ]);
  }
  return new Uint8Array(readFileSync(path));
}

function tone(text: string): Uint8Array {
  const hz = 200 + (text.length % 40) * 11;
  const path = join(scratch, `${String(hz)}.mp3`);
  if (!existsSync(path)) {
    ff([
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=${String(hz)}:duration=0.4:sample_rate=44100`,
      "-ac",
      "2",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "128k",
      path,
    ]);
  }
  return new Uint8Array(readFileSync(path));
}

interface Harness {
  readonly db: DatabaseSync;
  readonly dir: string;
  readonly projectId: string;
  readonly runner: Runner;
  readonly deps: Parameters<typeof editArticle>[0];
  readonly tts: FakeTts;
  readonly images: FakeImage;
  readonly renders: () => number;
  readonly settle: () => Promise<void>;
  readonly counted: Counted;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-reruns-run-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const counted = recordingCounter();
  const deps = { db, paths, ids, clock: systemClock, log: silent, count: counted.count };
  const draft: RunDraft = {
    title: "Rope Tricks",
    format: "16:9",
    sources: {
      research: "off",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "off",
      video: "generate",
    },
    llm: { provider: "fake-llm", model: "fake-1" },
    audio: { provider: "fake-tts", model: "fake-tts", voice: "narrator" },
    images: { provider: "fake-image", model: "fake-diffusion" },
    articlePrompt: "Article",
    imagePrompts: [{ name: "Wide", number: 3 }],
    values: {},
    provided: {},
    silenceGapSeconds: 0,
  };
  const { project } = startRun({ ...deps, emit: (): void => {} }, draft, {
    article: "write about rope",
    "imagePrompts.0": "a coil of rope",
  });
  const dir = join(paths.projects, project.id);
  mkdirSync(dir, { recursive: true });

  const llm = fakeLlm({ deltas: [written] });
  const tts = fakeTts({ bytesFor: (req) => [tone(req.text)] });
  const images = fakeImage({ bytes: still() });
  const registry: Registry = {
    llm: () => llm,
    tts: () => tts,
    image: () => images,
    list: () => Promise.resolve([]),
  };
  const providers = {
    registry,
    attempts: sqliteAttempts(db, ids),
    clock: systemClock,
    log: silent,
  };
  const video = { ...deps, ffmpeg };
  const events: ProjectEvent[] = [];
  const runner = createRunner({
    stages: {
      stagesOf: (id) => stagesOf(db, id),
      claim: (stageId) => claimStage(db, stageId, systemClock.now().toISOString()),
      finish: (stageId, state, failureReason) =>
        finishStage(db, stageId, state, failureReason, systemClock.now().toISOString()),
    },
    runs: {
      article: (context) => runArticle(deps, context, stageProviders(providers, context)),
      audio: (context) => runNarration(video, context, stageProviders(providers, context)),
      images: (context) => runImages(deps, context, stageProviders(providers, context)),
      video: (context) => renderVideo(video, context),
    },
    emit: (_id, event) => {
      events.push(event);
    },
    emitRunningCount: (): void => {},
    log: silent,
  });

  return {
    db,
    dir,
    projectId: project.id,
    runner,
    deps,
    counted,
    tts,
    images,
    renders: () =>
      events.filter(
        (event) =>
          event.type === "stage.state" && event.stage === "video" && event.state === "done",
      ).length,
    settle: async (): Promise<void> => {
      runner.tick(project.id);
      await runner.settled();
    },
  };
}

function status(h: Harness): string {
  return derive(stagesOf(h.db, h.projectId));
}

function imageOutputs(h: Harness): { id: string; path: string }[] {
  return outputsOf(h.db, h.projectId)
    .filter((output) => output.role === "image")
    .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0))
    .map((output) => ({ id: output.id, path: output.path }));
}

function renderedImages(h: Harness): string[] {
  const plan = JSON.parse(readFileSync(join(h.dir, "render.json"), "utf8")) as {
    images: readonly { path: string }[];
  };
  return plan.images.map((slot) => slot.path);
}

describe("an edit and a delete on a finished project", () => {
  // §Q101 and §Q102: the audio and the video are redone from the new text, the images are
  // not touched, and the cascade ends in a fresh render with the project `done` again.
  it("cascades an article edit through the audio to a fresh render", async () => {
    const h = harness();
    await h.settle();

    expect(status(h)).toBe("done");
    expect(h.renders()).toBe(1);
    expect(h.tts.seen()).toEqual(["Rope\n\nRope is older than writing."]);
    const madeImages = h.images.calls();
    const firstBody = readFileSync(join(h.dir, "audio-body.mp3"));

    expect(editArticle(h.deps, h.projectId, edited)).toEqual({
      ok: true,
      redone: ["audio", "video"],
    });
    await h.settle();

    expect(status(h)).toBe("done");
    expect(readFileSync(join(h.dir, "article.md"), "utf8")).toBe(edited);
    expect(readFileSync(join(h.dir, "article.txt"), "utf8")).toBe(
      "Knots\n\nKnots hold fast under load.\n",
    );
    // The narration is the edit's, and it was spoken again rather than reused.
    expect(h.tts.seen().at(-1)).toBe("Knots\n\nKnots hold fast under load.");
    expect(readFileSync(join(h.dir, "audio-body.mp3")).equals(firstBody)).toBe(false);
    // §Q101: "prompt-based images are untouched".
    expect(h.images.calls()).toBe(madeImages);
    expect(imageOutputs(h)).toHaveLength(3);
    // §Q102: "ending in a fresh render".
    expect(h.renders()).toBe(2);
    expect(renderedImages(h)).toHaveLength(3);
    // logic/16 step 3: "regenerations count again". The re-narration and the re-render
    // are counted a second time; the images the edit left alone are counted once.
    const counted = h.counted.events().map((one) => one.counters);
    expect(counted.filter((one) => one.stage === "video")).toHaveLength(2);
    expect(counted.filter((one) => one.stage === "audio" && one.segment === "body")).toHaveLength(
      2,
    );
    expect(counted.filter((one) => one.stage === "images")).toEqual([
      { stage: "images", provider: "fake-image", model: "fake-diffusion", images: 3 },
    ]);
    // §Q131: nothing here is a project delete, and the audio seconds only ever grow.
    expect(counted.reduce((sum, one) => sum + (one.audioSeconds ?? 0), 0)).toBeGreaterThan(0);
  }, 180_000);

  // Step 5 with `logic/09` §Q75: one image leaves the set, the video is rebuilt without
  // it, and the last one may not go.
  it("re-renders without a deleted image and refuses to delete the last one", async () => {
    const h = harness();
    await h.settle();
    const [first, second, third] = imageOutputs(h);
    if (first === undefined || second === undefined || third === undefined) {
      throw new Error("the run stored fewer than three images");
    }

    expect(deleteImage(h.deps, h.projectId, second.id)).toEqual({ ok: true, redone: ["video"] });
    await h.settle();

    expect(status(h)).toBe("done");
    expect(h.renders()).toBe(2);
    expect(existsSync(join(h.dir, second.path))).toBe(false);
    // `logic/11`'s invariant, with the gap `meta.index` leaves behind harmless.
    expect(renderedImages(h)).toEqual([first.path, third.path]);

    expect(deleteImage(h.deps, h.projectId, first.id)).toEqual({ ok: true, redone: ["video"] });
    await h.settle();
    expect(renderedImages(h)).toEqual([third.path]);

    // §Q103's invariant: "at least one image always remains".
    expect(deleteImage(h.deps, h.projectId, third.id)).toEqual({
      ok: false,
      reason: "last-image",
    });
    expect(existsSync(join(h.dir, third.path))).toBe(true);
    expect(existsSync(join(h.dir, "video.mp4"))).toBe(true);
    expect(h.renders()).toBe(3);
  }, 180_000);
});
