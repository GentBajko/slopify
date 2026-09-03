import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm, reportedUsage } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import type { Ids } from "../src/kernel/ids.js";
import type { Log } from "../src/kernel/log.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import type { LlmCompletion } from "../src/kernel/ports/llm.js";
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
import { runResearch } from "../src/slices/research/run.js";
import { outputsOf } from "../src/slices/storage/repo.js";
import type { RecordEvent, TelemetryPayload } from "../src/slices/telemetry/model.js";
import { record } from "../src/slices/telemetry/record.js";
import { insertMachine, undeliveredEvents } from "../src/slices/telemetry/repo.js";
import { runThumbnail } from "../src/slices/thumbnail/run.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { renderVideo } from "../src/slices/video/run.js";

// `logic/16` steps 2 and 3 over a whole pipeline: every stage of a run made by the real
// stages and the real runner, counted through the real `record` into the real queue. No
// provider is called; `adapters/fake/*` are the scripted doubles (06-testing), and the
// render is the bundled ffmpeg.

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const appVersion = "1.2.3";

// The rendered texts each call is recognised by, so the script below can answer as the
// stage that asked. Every one of them is prompt text, which is on logic/16 step 4's
// never-list: the last assertion of this file checks none of it reached a payload.
const articlePrompt = "PROMPT-ARTICLE: write about rope";
const introBody = "PROMPT-INTRO: open the video";
const outroBody = "PROMPT-OUTRO: close the video";
const thumbnailBody = "PROMPT-THUMB: a bold thumbnail";
const imageBody = "PROMPT-IMAGE: a coil of rope on a dock";
const title = "Rope Tricks";
const keyword = "monkey fist";
const article = "# Rope\n\nRope is older than writing.";

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"] });
}

const scratch = mkdtempSync(join(tmpdir(), "slopify-counter-fixtures-"));

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

// One mp3 per distinct text, so the three narrated segments have three real durations for
// step 3's "audio seconds from the measured duration per segment" to be read off.
function tone(text: string): Uint8Array {
  const tenths = 3 + (text.length % 5);
  const path = join(scratch, `tone-${String(tenths)}.mp3`);
  if (!existsSync(path)) {
    ff([
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      `sine=frequency=440:duration=${(tenths / 10).toFixed(1)}:sample_rate=44100`,
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

// Every LLM turn of the pipeline, answered as the stage that asked for it needs.
function reply(req: LlmCompletion): readonly string[] {
  const prompt = req.messages[0]?.content ?? "";
  if (prompt.startsWith("You are planning")) {
    return ["History\nMaterials"];
  }
  if (prompt.startsWith("You are researching")) {
    return ["Found it.\n\nSources\nhttps://example.test/one"];
  }
  if (prompt.startsWith("You are the editor")) {
    return ["All of it.\n\nSources\nhttps://example.test/all"];
  }
  if (prompt.startsWith(introBody)) {
    return ["Welcome to the channel."];
  }
  if (prompt.startsWith(outroBody)) {
    return ["Thanks for watching."];
  }
  if (prompt.startsWith(thumbnailBody)) {
    return ["A weathered dock at golden hour."];
  }
  return [article];
}

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: ReturnType<typeof layout>;
  readonly projectId: string;
  readonly run: () => Promise<void>;
  readonly runner: Runner;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-counters-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  migrate(db, systemClock);
  // logic/16 step 1: nothing is recorded before the notice created the machine id, so the
  // row the dismissal writes has to be there for any of this to be counted.
  insertMachine(db, {
    machineId: "7b1f0d2e-0000-4000-8000-000000000000",
    noticeSeenAt: "2026-09-03T08:00:00.000Z",
    appVersion,
  });

  let n = 0;
  const ids: Ids = {
    next: (): string => {
      n += 1;
      return `id${String(n)}`;
    },
  };
  const count: RecordEvent = (type, counters) => {
    record({ db, ids, clock: systemClock, log: silent, appVersion }, type, counters);
  };
  const deps = { db, paths, ids, clock: systemClock, log: silent, count };
  const video = { ...deps, ffmpeg };

  const draft: RunDraft = {
    title,
    format: "16:9",
    sources: {
      research: "generate",
      article: "generate",
      audio: "generate",
      images: "generate",
      thumbnail: "prompt_by_llm",
      video: "generate",
    },
    llm: { provider: "fake-llm", model: "fake-model" },
    audio: { provider: "fake-tts", model: "fake-tts", voice: "narrator" },
    images: { provider: "fake-image", model: "fake-diffusion" },
    articlePrompt: "Article",
    imagePrompts: [{ name: "Wide", number: 2 }],
    thumbnailPrompt: "Bold",
    intro: { name: "Hook", mode: "llm" },
    outro: { name: "Sign-off", mode: "llm" },
    values: { knot: keyword },
    provided: {},
    chunking: { mode: "whole" },
    silenceGapSeconds: 0,
  };
  const { project } = startRun({ ...deps, emit: (): void => {} }, draft, {
    article: articlePrompt,
    intro: introBody,
    outro: outroBody,
    thumbnailPrompt: thumbnailBody,
    "imagePrompts.0": imageBody,
  });
  mkdirSync(join(paths.projects, project.id), { recursive: true });

  const llm = fakeLlm({ reply });
  const tts = fakeTts({ bytesFor: (req) => [tone(req.text)] });
  const image = fakeImage({ bytes: still() });
  const registry: Registry = {
    llm: () => llm,
    tts: () => tts,
    image: () => image,
    list: () => Promise.resolve([]),
  };
  const providers = {
    registry,
    attempts: sqliteAttempts(db, ids),
    clock: systemClock,
    log: silent,
  };
  const runner = createRunner({
    stages: {
      stagesOf: (id) => stagesOf(db, id),
      claim: (stageId) => claimStage(db, stageId, systemClock.now().toISOString()),
      finish: (stageId, state, failureReason) =>
        finishStage(db, stageId, state, failureReason, systemClock.now().toISOString()),
    },
    runs: {
      research: (context) => runResearch(deps, context, stageProviders(providers, context)),
      article: (context) => runArticle(deps, context, stageProviders(providers, context)),
      audio: (context) => runNarration(video, context, stageProviders(providers, context)),
      images: (context) => runImages(deps, context, stageProviders(providers, context)),
      thumbnail: (context) => runThumbnail(deps, context, stageProviders(providers, context)),
      video: (context) => renderVideo(video, context),
    },
    emit: (): void => {},
    emitRunningCount: (): void => {},
    log: silent,
  });

  return {
    db,
    paths,
    projectId: project.id,
    runner,
    run: async (): Promise<void> => {
      runner.tick(project.id);
      await runner.settled();
    },
  };
}

function payloads(db: DatabaseSync): TelemetryPayload[] {
  return undeliveredEvents(db, 100).map((event) => event.payload);
}

// The unit of logic/16 step 2 an event belongs to: the stage, and the segment when the
// unit is narrower than the stage.
function unitOf(payload: TelemetryPayload): string {
  const stage = payload.stage ?? "project.created";
  return payload.segment === undefined ? stage : `${stage}/${payload.segment}`;
}

describe("a whole pipeline against the fakes", () => {
  it("records one event per unit of logic/16 step 2, with the counters of step 3", async () => {
    const h = harness();
    // logic/16 step 2: one event per project created. The route records it; here the
    // pipeline is driven directly, so it is recorded the same way the route does.
    record(
      { db: h.db, ids: { next: () => "created" }, clock: systemClock, log: silent, appVersion },
      "project.created",
      {},
    );

    await h.run();

    expect(derive(stagesOf(h.db, h.projectId))).toBe("done");
    // Keyed rather than ordered: the article's fan-out starts audio, images and the
    // thumbnail together, so which of the three finishes first is not a rule.
    const byUnit = new Map(payloads(h.db).map((row) => [unitOf(row), row]));

    // One event per unit of logic/16 step 2: the project, research, the article, its
    // intro and outro texts, the narration, the images, the thumbnail and the render.
    //
    // The narration is the body alone. That is a defect of the audio stage, not of the
    // counters: `slices/article/run.ts` stores its `segment` pieces under the article
    // stage's id and `slices/narration/run.ts` looks for them under the audio stage's, so
    // a real pipeline never narrates the picked intro and outro at all - `logic/08` §Q93
    // asks for one request per picked segment. It is reported rather than fixed here.
    // When it is fixed this list gains "audio/intro" and "audio/outro" and nothing that
    // logic/16 owns changes.
    expect([...byUnit.keys()].toSorted()).toEqual(
      [
        "project.created",
        "research",
        "article",
        "article/intro",
        "article/outro",
        "audio/body",
        "images",
        "thumbnail",
        "video",
      ].toSorted(),
    );

    // Step 3, counter by counter, against what the stages actually did. The fake reports
    // 11 tokens in and 22 out per answered call.
    const llm = { provider: "fake-llm", model: "fake-model" };
    const perCall = { tokensIn: reportedUsage.inputTokens, tokensOut: reportedUsage.outputTokens };
    expect(byUnit.get("project.created")).toEqual({ appVersion });
    // Four calls: the planner, one per chapter, and the synthesis.
    expect(byUnit.get("research")).toEqual({
      appVersion,
      stage: "research",
      ...llm,
      tokensIn: perCall.tokensIn * 4,
      tokensOut: perCall.tokensOut * 4,
    });
    expect(byUnit.get("article")).toEqual({ appVersion, stage: "article", ...llm, ...perCall });
    expect(byUnit.get("article/intro")).toEqual({
      appVersion,
      stage: "article",
      segment: "intro",
      ...llm,
      ...perCall,
    });
    expect(byUnit.get("article/outro")).toEqual({
      appVersion,
      stage: "article",
      segment: "outro",
      ...llm,
      ...perCall,
    });
    // Two sends of one prompt, so two images; no tokens, because an image call reports
    // none. The thumbnail names the LLM that wrote its prompt, whose tokens it reports.
    expect(byUnit.get("images")).toEqual({
      appVersion,
      stage: "images",
      provider: "fake-image",
      model: "fake-diffusion",
      images: 2,
    });
    expect(byUnit.get("thumbnail")).toEqual({
      appVersion,
      stage: "thumbnail",
      ...llm,
      ...perCall,
      thumbnails: 1,
    });
    // One completed render, and ffmpeg is nobody's service.
    expect(byUnit.get("video")).toEqual({ appVersion, stage: "video" });

    // The audio seconds are the measured duration of the file the stage stored, which is
    // the number `logic/11` builds the video timeline from (§Q68).
    const measured = outputsOf(h.db, h.projectId)
      .filter((output) => output.role === "audio_body")
      .map((output) => (output.durationMs ?? 0) / 1000);
    expect(byUnit.get("audio/body")).toEqual({
      appVersion,
      stage: "audio",
      segment: "body",
      provider: "fake-tts",
      audioSeconds: measured[0],
    });
    expect(measured[0]).toBeGreaterThan(0.2);
    h.db.close();
  }, 180_000);

  // logic/16 step 4 and the promise in mockup/02-first-run-notice, checked against the
  // rows a real run left in the queue rather than against a hand-written payload.
  it("puts nothing from the never-list into a payload", async () => {
    const h = harness();

    await h.run();

    const wire = JSON.stringify(payloads(h.db));
    for (const secret of [
      title,
      keyword,
      articlePrompt,
      introBody,
      outroBody,
      thumbnailBody,
      imageBody,
      article,
      "Welcome to the channel",
      "A weathered dock",
      "https://example.test",
      "video.mp4",
      h.projectId,
      h.paths.dataDir,
    ]) {
      expect(wire).not.toContain(secret);
    }
    // Only the allow-listed keys, whatever the run did.
    expect([...new Set(payloads(h.db).flatMap((row) => Object.keys(row)))].toSorted()).toEqual(
      [
        "appVersion",
        "audioSeconds",
        "images",
        "model",
        "provider",
        "segment",
        "stage",
        "thumbnails",
        "tokensIn",
        "tokensOut",
      ].toSorted(),
    );
    h.db.close();
  }, 180_000);

  // §Q131: "deleting a project changes nothing". There is no delete control yet, so the
  // project row goes the way the schema's ON DELETE CASCADE would take it - stages,
  // pieces, attempts and outputs with it. Nothing follows, because a telemetry payload
  // names no project: that is the whole reason the rule holds.
  it("keeps every counter when the project row is deleted", async () => {
    const h = harness();
    await h.run();
    const before = payloads(h.db);
    expect(outputsOf(h.db, h.projectId).length).toBeGreaterThan(0);

    h.db.exec("PRAGMA foreign_keys = ON");
    h.db.prepare("DELETE FROM projects WHERE id = ?").run(h.projectId);

    expect(outputsOf(h.db, h.projectId)).toEqual([]);
    expect(stagesOf(h.db, h.projectId)).toEqual([]);
    expect(payloads(h.db)).toEqual(before);
    h.db.close();
  }, 180_000);
});
