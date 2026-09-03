import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { StageKind, StageState } from "../src/kernel/pipeline.js";
import { stageKinds } from "../src/kernel/pipeline.js";
import type { GeneratedImage, ImagePort, ImageRequest } from "../src/kernel/ports/image.js";
import type { Registry } from "../src/kernel/ports/registry.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import { derive } from "../src/kernel/runner/graph.js";
import type { Runner, StageRun } from "../src/kernel/runner/index.js";
import { createRunner } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { claimStage, finishStage, stagesOf } from "../src/slices/admission/repo.js";
import { cancelProject } from "../src/slices/cancel/index.js";
import { runImages } from "../src/slices/images/run.js";
import { retryStage } from "../src/slices/reruns/index.js";
import { outputsOf } from "../src/slices/storage/repo.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";

// `logic/13` through the real runner and the real images stage: what a cancel aborts,
// what it keeps, and what a retry afterwards has left to do. No provider is called - the
// image port below is the scripted double (06-testing) - and no render is run: the video
// stage is a stub here precisely so the test can prove it never started.

const silent: Log = { write: (): void => {} };
const projectId = "p1";
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

interface Harness {
  readonly db: DatabaseSync;
  readonly dir: string;
  readonly runner: Runner;
  readonly videoRuns: () => number;
  readonly cancel: () => Promise<Awaited<ReturnType<typeof cancelProject>>>;
  readonly reruns: Parameters<typeof retryStage>[0];
  readonly use: (port: ImagePort) => void;
  readonly stateOf: (kind: StageKind) => StageState;
  readonly counted: Counted;
}

function harness(images: number, port: ImagePort): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-cancel-run-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  const dir = join(paths.projects, projectId);
  mkdirSync(dir, { recursive: true });

  db.prepare("INSERT INTO projects VALUES (?, 'Rope', '16:9', ?, ?, ?)").run(
    projectId,
    JSON.stringify({
      title: "Rope",
      format: "16:9",
      sources: {
        research: "off",
        article: "provide",
        audio: "provide",
        images: "generate",
        thumbnail: "off",
        video: "generate",
      },
      images: { provider: "fake-image", model: "fake-diffusion" },
      imagePrompts: [{ name: "Wide", number: images }],
      values: {},
      provided: {},
      rendered: { "imagePrompts.0": "a coil of rope" },
      silenceGapSeconds: 0,
    }),
    "2026-09-03",
    "2026-09-03",
  );
  // `logic/01` step 1: Off is `skipped`, Provide is `provided` with its output attached.
  const states: Record<StageKind, StageState> = {
    research: "skipped",
    article: "provided",
    audio: "provided",
    images: "pending",
    thumbnail: "skipped",
    video: "pending",
  };
  for (const kind of stageKinds) {
    db.prepare(
      "INSERT INTO stages (id, project_id, kind, source, state) VALUES (?, ?, ?, 'generate', ?)",
    ).run(`s-${kind}`, projectId, kind, states[kind]);
  }
  writeFileSync(join(dir, "audio-body.mp3"), "audio");
  db.prepare(
    "INSERT INTO outputs (id, project_id, stage_kind, role, path, bytes, meta, created_at) VALUES ('o-body', ?, 'audio', 'audio_body', 'audio-body.mp3', 5, '{}', '2026-09-03')",
  ).run(projectId);

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  let current = port;
  const registry: Registry = {
    llm: () => {
      throw new Error("no llm adapter");
    },
    tts: () => {
      throw new Error("no tts adapter");
    },
    image: () => current,
    list: () => Promise.resolve([]),
  };
  const providers = {
    registry,
    attempts: sqliteAttempts(db, ids),
    clock: systemClock,
    log: silent,
  };
  const counted = recordingCounter();
  const writing = { db, paths, ids, clock: systemClock, log: silent, count: counted.count };
  let videoRuns = 0;
  const video: StageRun = async (): Promise<void> => {
    videoRuns += 1;
  };
  const runner = createRunner({
    stages: {
      stagesOf: (id) => stagesOf(db, id),
      claim: (stageId) => claimStage(db, stageId, systemClock.now().toISOString()),
      finish: (stageId, state, failureReason) =>
        finishStage(db, stageId, state, failureReason, systemClock.now().toISOString()),
    },
    runs: {
      images: (context) => runImages(writing, context, stageProviders(providers, context)),
      video,
    },
    emit: (): void => {},
    emitRunningCount: (): void => {},
    log: silent,
  });

  return {
    db,
    dir,
    runner,
    videoRuns: () => videoRuns,
    cancel: () =>
      cancelProject(
        {
          db,
          clock: systemClock,
          log: silent,
          abort: (id) => runner.abortProject(id),
          emit: (): void => {},
        },
        projectId,
      ),
    reruns: writing,
    counted,
    use: (next: ImagePort): void => {
      current = next;
    },
    stateOf: (kind) => stagesOf(db, projectId).find((one) => one.kind === kind)?.state ?? "pending",
  };
}

function imagePort(generate: (req: ImageRequest) => Promise<GeneratedImage>): ImagePort {
  return {
    id: "fake-image",
    models: () => Promise.resolve([{ id: "fake-diffusion", name: "Fake Diffusion" }]),
    generate,
  };
}

interface Latch {
  readonly reached: Promise<void>;
  readonly trip: () => void;
}

function latch(): Latch {
  let trip = (): void => {};
  const reached = new Promise<void>((resolve) => {
    trip = resolve;
  });
  return { reached, trip };
}

function imagePaths(h: Harness): string[] {
  return outputsOf(h.db, projectId)
    .filter((output) => output.role === "image")
    .map((output) => output.path);
}

describe("cancelling a run", () => {
  // Steps 1-3 and §Q110: the images that landed are kept, the calls in flight are aborted
  // and nothing waits for them, the stage reads `canceled` and the project with it.
  it("stops the calls in flight, keeps what landed, and reads canceled", async () => {
    // One image answers at once; the other two never answer, which is what a cancel has to
    // be able to walk away from.
    let landedFirst = false;
    const h = harness(
      3,
      imagePort(
        (req) =>
          new Promise<GeneratedImage>((resolve, reject) => {
            if (landedFirst) {
              req.signal.addEventListener("abort", () => {
                reject(req.signal.reason);
              });
              return;
            }
            landedFirst = true;
            resolve({ bytes: png, mime: "image/png" });
          }),
      ),
    );

    h.runner.tick(projectId);
    await waitFor(() => imagePaths(h).length === 1);

    const result = await h.cancel();

    expect(result).toEqual({ ok: true, canceled: ["images"], state: "canceled" });
    expect(h.stateOf("images")).toBe("canceled");
    // §Q110: "within a running stage, the pieces already completed ... for resume".
    expect(piecesOf(h.db, "s-images", "image").map((piece) => piece.state)).toEqual([
      "done",
      "pending",
      "pending",
    ]);
    expect(imagePaths(h)).toEqual(["images/001.png"]);
    // §Q111's invariant: after cancel completes no stage of the project is running, and
    // the stages the run had not reached stay pending.
    expect(h.stateOf("video")).toBe("pending");
    expect(h.videoRuns()).toBe(0);
    // §Q112: an aborted call contributes nothing - the row is closed with no error text
    // because the user stopped it, the provider did not fail.
    const canceled = attemptsOf(h.db, "s-images").filter((one) => one.outcome === "canceled");
    expect(canceled).toHaveLength(2);
    expect(canceled.map((one) => one.errorText)).toEqual([null, null]);
    // Nothing was retried: a cancel is not a failure.
    expect(attemptsOf(h.db, "s-images").every((one) => one.n === 1)).toBe(true);
    // §Q112 through logic/16 step 3: the stage never completed, so it counted nothing -
    // the two aborted calls least of all.
    expect(h.counted.events()).toEqual([]);
  });

  // Step 5: "retry on a `canceled` stage resumes exactly like a `failed` one ... and the
  // cascade continues".
  it("resumes on retry, remakes only what was missing, and runs on to the video", async () => {
    let landedFirst = false;
    const h = harness(
      3,
      imagePort(
        (req) =>
          new Promise<GeneratedImage>((resolve, reject) => {
            if (landedFirst) {
              req.signal.addEventListener("abort", () => {
                reject(req.signal.reason);
              });
              return;
            }
            landedFirst = true;
            resolve({ bytes: png, mime: "image/png" });
          }),
      ),
    );

    h.runner.tick(projectId);
    await waitFor(() => imagePaths(h).length === 1);
    await h.cancel();

    let asked = 0;
    h.use(
      imagePort(() => {
        asked += 1;
        return Promise.resolve({ bytes: png, mime: "image/png" });
      }),
    );
    expect(retryStage(h.reruns, projectId, "images")).toEqual({ ok: true, redone: ["images"] });
    h.runner.tick(projectId);
    await h.runner.settled();

    // The image that landed before the cancel is not made again.
    expect(asked).toBe(2);
    expect(imagePaths(h).toSorted()).toEqual([
      "images/001.png",
      "images/002.png",
      "images/003.png",
    ]);
    expect(h.stateOf("images")).toBe("done");
    // The cascade continues: the video the cancel held back renders once the stage is done.
    expect(h.videoRuns()).toBe(1);
    // §Q112 again: the resumed run made two images and counted those two. The image the
    // cancelled run had already stored is not made again, so it is not counted again.
    expect(h.counted.events().map((one) => one.counters.images)).toEqual([2]);
    expect(derive(stagesOf(h.db, projectId))).toBe("done");
  });

  // §Q113: "a stage whose output was stored in the same instant as the cancel stays
  // `done`; cancel never rolls back a stored output" - and the barrier is what stops that
  // stage from releasing the video into a run nobody aborted.
  it("keeps a stage that stored its output as the cancel landed, and starts no dependent", async () => {
    const inFlight = latch();
    const h = harness(
      1,
      imagePort(
        (req) =>
          new Promise<GeneratedImage>((resolve) => {
            // The image answers exactly when the abort arrives, which is the instant
            // §Q113 is about.
            req.signal.addEventListener("abort", () => {
              resolve({ bytes: png, mime: "image/png" });
            });
            inFlight.trip();
          }),
      ),
    );

    h.runner.tick(projectId);
    await inFlight.reached;
    const result = await h.cancel();

    expect(h.stateOf("images")).toBe("done");
    expect(imagePaths(h)).toEqual(["images/001.png"]);
    expect(existsSync(join(h.dir, "images", "001.png"))).toBe(true);
    // No stage ended `canceled`, so §Q9's derivation has nothing to read the cancel off.
    // `logic/13` step 3 says the project reads `canceled` all the same, and
    // `kernel/runner/graph.ts` extends §Q9's fallback to say so: a run that carried a
    // stage to `done` and then stopped is not a run about to start.
    expect(result).toEqual({ ok: true, canceled: [], state: "canceled" });
    // Every dependency of the video is now satisfied - audio provided, thumbnail skipped,
    // images done - so only the cancel's own barrier keeps the render from starting.
    expect(h.stateOf("video")).toBe("pending");
    expect(h.videoRuns()).toBe(0);
    // §Q112 reads from the other side here: the call completed before the abort took
    // effect, the image is stored, and it is counted. The render never ran, so no video
    // is counted.
    expect(h.counted.events().map((one) => one.counters)).toEqual([
      { stage: "images", provider: "fake-image", model: "fake-diffusion", images: 1 },
    ]);
  });
});

// ceiling: polls the database every millisecond for up to five seconds. The stage
// announces each image on the event hub too, but reading the row is what the assertions
// below read, so the wait and the check are the same question.
async function waitFor(ready: () => boolean): Promise<void> {
  for (let tries = 0; tries < 5000; tries += 1) {
    if (ready()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  throw new Error("the condition never became true");
}
