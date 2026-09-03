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
import {
  allTelemetryEvents,
  insertMachine,
  undeliveredEvents,
} from "../src/slices/telemetry/repo.js";
import { usageOf } from "../src/slices/telemetry/usage.js";
import { runThumbnail } from "../src/slices/thumbnail/run.js";
import { resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { renderVideo } from "../src/slices/video/run.js";

// Counting over a whole pipeline: every stage of a run made by the real stages and the real
// runner, counted through the real `record` into the real queue. No provider is called;
// `adapters/fake/*` are the scripted doubles, and the render is the bundled ffmpeg.

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
const appVersion = "1.2.3";

// The rendered texts each call is recognised by, so the script below can answer as the
// stage that asked. Every one of them is prompt text, which is on the never-list: the last
// assertion of this file checks none of it reached a payload.
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
// the audio seconds to be read off the measured duration per segment.
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
  // Nothing is recorded before the notice created the machine id, so the
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

// The unit an event belongs to: the stage, and the segment when the unit is narrower than
// the stage.
function unitOf(payload: TelemetryPayload): string {
  const stage = payload.stage ?? "project.created";
  return payload.segment === undefined ? stage : `${stage}/${payload.segment}`;
}

describe("a whole pipeline against the fakes", () => {
  it("records one event per counted unit, with its counters", async () => {
    const h = harness();
    // One event per project created. The route records it; here the
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

    // One event per unit: the project, research, the article, its intro and outro texts,
    // the three narrated segments, the images, the thumbnail and the render. The narration
    // is three units because each picked segment is a request of its own, narrated from
    // the pieces the article stage wrote.
    expect([...byUnit.keys()].toSorted()).toEqual(
      [
        "project.created",
        "research",
        "article",
        "article/intro",
        "article/outro",
        "audio/body",
        "audio/intro",
        "audio/outro",
        "images",
        "thumbnail",
        "video",
      ].toSorted(),
    );

    // Counter by counter, against what the stages actually did. The fake reports
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
    // the number the video timeline is built from. One event per segment, each carrying its
    // own file's duration rather than the run's total.
    const outputs = outputsOf(h.db, h.projectId);
    for (const [segment, role] of [
      ["body", "audio_body"],
      ["intro", "audio_intro"],
      ["outro", "audio_outro"],
    ] as const) {
      const measured = (outputs.find((output) => output.role === role)?.durationMs ?? 0) / 1000;
      expect(measured).toBeGreaterThan(0.2);
      expect(byUnit.get(`audio/${segment}`)).toEqual({
        appVersion,
        stage: "audio",
        segment,
        provider: "fake-tts",
        audioSeconds: measured,
      });
    }
    h.db.close();
  }, 180_000);

  // The never-list and the promise the first-run notice makes, checked against the rows a
  // real run left in the queue rather than against a hand-written payload.
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

  // Usage page totals equal the sum of the local event log. The numbers below are what the
  // stages of the run above actually did, counted by hand.
  it("adds up to the totals the Usage page serves", async () => {
    const h = harness();
    record(
      { db: h.db, ids: { next: () => "created" }, clock: systemClock, log: silent, appVersion },
      "project.created",
      {},
    );

    await h.run();

    const usage = usageOf({
      events: allTelemetryEvents(h.db),
      machineId: null,
      appVersion,
    });
    // Every second the run narrated: the body and the two picked segments.
    const audioSeconds = outputsOf(h.db, h.projectId)
      .filter((output) => output.role.startsWith("audio_"))
      .reduce((total, output) => total + (output.durationMs ?? 0) / 1000, 0);
    // Eight answered LLM calls: four for research, one for the article, one for each entry
    // text and one for the thumbnail prompt.
    const perCall = reportedUsage.inputTokens + reportedUsage.outputTokens;
    expect(usage.counters).toEqual({
      videosMade: 1,
      audioSeconds,
      imagesMade: 2,
      tokensUsed: perCall * 8,
      projects: 1,
    });
    // Every token belongs to the one model that was asked, split across the two stages
    // that asked it; the research stage asked four times, so it leads the table.
    expect(usage.byStage).toEqual([
      {
        stage: "research",
        provider: "fake-llm",
        model: "fake-model",
        tokensIn: reportedUsage.inputTokens * 4,
        tokensOut: reportedUsage.outputTokens * 4,
      },
      {
        stage: "article",
        provider: "fake-llm",
        model: "fake-model",
        tokensIn: reportedUsage.inputTokens * 3,
        tokensOut: reportedUsage.outputTokens * 3,
      },
      {
        stage: "thumbnail",
        provider: "fake-llm",
        model: "fake-model",
        tokensIn: reportedUsage.inputTokens,
        tokensOut: reportedUsage.outputTokens,
      },
    ]);
    h.db.close();
  }, 180_000);

  // Deleting a project changes nothing. There is no delete control yet, so the project row goes
  // the way the schema's ON DELETE CASCADE would take it - stages, pieces, attempts and outputs
  // with it. Nothing follows, because a telemetry payload names no project: that is the whole
  // reason the rule holds.
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
