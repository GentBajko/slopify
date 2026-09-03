import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import ffmpegStatic from "ffmpeg-static";
import { describe, expect, it } from "vitest";
import { fakeImage } from "../src/adapters/fake/image.js";
import { fakeLlm } from "../src/adapters/fake/llm.js";
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
import { createRunner } from "../src/kernel/runner/index.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import type { RunDraft } from "../src/slices/admission/model.js";
import { claimStage, finishStage, stagesOf } from "../src/slices/admission/repo.js";
import { startRun } from "../src/slices/admission/start.js";
import { runArticle } from "../src/slices/article/run.js";
import { runImages } from "../src/slices/images/run.js";
import { runNarration } from "../src/slices/narration/run.js";
import type { Output } from "../src/slices/storage/model.js";
import { outputsOf } from "../src/slices/storage/repo.js";
import type { Counted } from "../src/slices/telemetry/record.fake.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";
import { probeDurationMs, resolveFfmpeg } from "../src/slices/video/ffmpeg.js";
import { renderVideo } from "../src/slices/video/run.js";

// `logic/07` step 5 writes the picked intro and outro texts, `logic/08` step 5 narrates
// them and `logic/11` step 1 puts them either side of the body with a gap between. That
// hand-over crosses two stages and two stage ids, so it is proved here over the real
// stages, the real runner and the bundled ffmpeg. No provider is called: `adapters/fake/*`
// are the doubles (06-testing).

const silent: Log = { write: (): void => {} };
const ffmpeg = resolveFfmpeg(process.env, ffmpegStatic);
// Short enough to render in a test, long enough that the five parts are told apart by a
// measurement rather than by rounding.
const gapSeconds = 1;

const articlePrompt = "PROMPT-ARTICLE: write about rope";
const introBody = "PROMPT-INTRO: open the video";
// The outro is picked in text mode, so this is spoken verbatim and no call is made for it
// (`logic/07` §Q98). The intro is LLM mode, so the model's answer is what is narrated.
const outroText = "Thanks for watching, and mind the splice.";
const introText = "Welcome to the channel.";
const imageBody = "PROMPT-IMAGE: a coil of rope on a dock";
const article = "# Rope\n\nRope is older than writing, and older than the wheel.";

const scratch = mkdtempSync(join(tmpdir(), "slopify-intro-outro-fixtures-"));

function ff(args: readonly string[]): void {
  execFileSync(ffmpeg, [...args], { stdio: ["ignore", "pipe", "pipe"] });
}

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

// A different length per request, so intro, body and outro cannot be confused for one
// another once they are measured off the timeline.
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

function reply(req: LlmCompletion): readonly string[] {
  const prompt = req.messages[0]?.content ?? "";
  return prompt.startsWith(introBody) ? [introText] : [article];
}

interface Harness {
  readonly db: DatabaseSync;
  readonly paths: ReturnType<typeof layout>;
  readonly projectId: string;
  readonly counted: Counted;
  readonly run: () => Promise<void>;
}

function harness(): Harness {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-intro-outro-")));
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
  const withFfmpeg = { ...deps, ffmpeg };

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
    llm: { provider: "fake-llm", model: "fake-model" },
    audio: { provider: "fake-tts", model: "fake-tts", voice: "narrator" },
    images: { provider: "fake-image", model: "fake-diffusion" },
    articlePrompt: "Article",
    imagePrompts: [{ name: "Wide", number: 1 }],
    intro: { name: "Hook", mode: "llm" },
    outro: { name: "Sign-off", mode: "text" },
    values: {},
    provided: {},
    chunking: { mode: "whole" },
    silenceGapSeconds: gapSeconds,
  };
  const { project } = startRun({ ...deps, emit: (): void => {} }, draft, {
    article: articlePrompt,
    intro: introBody,
    outro: outroText,
    "imagePrompts.0": imageBody,
  });
  mkdirSync(join(paths.projects, project.id), { recursive: true });

  const registry: Registry = {
    llm: () => fakeLlm({ reply }),
    tts: () => fakeTts({ bytesFor: (req) => [tone(req.text)] }),
    image: () => fakeImage({ bytes: still() }),
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
      article: (context) => runArticle(deps, context, stageProviders(providers, context)),
      audio: (context) => runNarration(withFfmpeg, context, stageProviders(providers, context)),
      images: (context) => runImages(deps, context, stageProviders(providers, context)),
      video: (context) => renderVideo(withFfmpeg, context),
    },
    emit: (): void => {},
    emitRunningCount: (): void => {},
    log: silent,
  });

  return {
    db,
    paths,
    projectId: project.id,
    counted,
    run: async (): Promise<void> => {
      runner.tick(project.id);
      await runner.settled();
    },
  };
}

interface PlannedSegment {
  readonly kind: string;
  readonly seconds: number;
}

function measure(path: string): Promise<number> {
  return probeDurationMs(ffmpeg, path, new AbortController().signal, silent);
}

function audioOf(outputs: readonly Output[], role: Output["role"]): Output {
  const found = outputs.find((output) => output.role === role);
  if (found === undefined) {
    throw new Error(`the run stored no ${role}`);
  }
  return found;
}

describe("a run with a picked intro and outro", () => {
  it("narrates all three segments and renders them into one timeline", async () => {
    const h = harness();

    await h.run();

    expect(derive(stagesOf(h.db, h.projectId))).toBe("done");
    const dir = join(h.paths.projects, h.projectId);
    const outputs = outputsOf(h.db, h.projectId);

    // `logic/08` §Q93 and §Q65's invariant: the body plus the two picked segments, each
    // its own file with the duration that was measured off it (§Q68).
    expect(
      outputs.filter((output) => output.stageKind === "audio").map((output) => output.role),
    ).toEqual(["audio_body", "audio_intro", "audio_outro"]);
    const parts = new Map<string, number>();
    for (const role of ["audio_body", "audio_intro", "audio_outro"] as const) {
      const output = audioOf(outputs, role);
      const measured = await measure(join(dir, output.path));
      expect(output.durationMs).toBe(measured);
      expect(measured).toBeGreaterThan(200);
      parts.set(role, measured / 1000);
    }
    // The three requests carried three different texts, so the three files differ.
    expect(new Set(parts.values()).size).toBe(3);

    // `logic/11` step 1: intro, gap, body, gap, outro, the gaps at the configured length.
    const plan = JSON.parse(readFileSync(join(dir, "render.json"), "utf8")) as {
      audio: readonly PlannedSegment[];
      gapSeconds: number;
      totalSeconds: number;
    };
    expect(plan.gapSeconds).toBe(gapSeconds);
    expect(plan.audio.map((segment) => segment.kind)).toEqual([
      "intro",
      "gap",
      "body",
      "gap",
      "outro",
    ]);
    expect(plan.audio.map((segment) => segment.seconds)).toEqual([
      parts.get("audio_intro"),
      gapSeconds,
      parts.get("audio_body"),
      gapSeconds,
      parts.get("audio_outro"),
    ]);

    // §Q95's invariant: "Video length = intro + gaps + body + outro", read off the mp4
    // rather than off the plan that asked for it. The tolerance is a frame and a half:
    // the video track is a whole number of frames at 30 fps and AAC cannot end a file
    // mid-block.
    const sumSeconds = plan.audio.reduce((total, segment) => total + segment.seconds, 0);
    expect(plan.totalSeconds).toBe(sumSeconds);
    const rendered = await measure(join(dir, "video.mp4"));
    expect(Math.abs(rendered - sumSeconds * 1000)).toBeLessThan(120);

    // logic/16 step 2: one event per narrated segment, and step 3 takes the seconds from
    // the measured duration rather than from the text.
    expect(
      h.counted
        .events()
        .map((one) => one.counters)
        .filter((counters) => counters.stage === "audio"),
    ).toEqual([
      {
        stage: "audio",
        segment: "body",
        provider: "fake-tts",
        audioSeconds: parts.get("audio_body"),
      },
      {
        stage: "audio",
        segment: "intro",
        provider: "fake-tts",
        audioSeconds: parts.get("audio_intro"),
      },
      {
        stage: "audio",
        segment: "outro",
        provider: "fake-tts",
        audioSeconds: parts.get("audio_outro"),
      },
    ]);
    h.db.close();
  }, 180_000);
});
