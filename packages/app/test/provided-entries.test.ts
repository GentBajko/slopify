import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { fakeLlm } from "../src/adapters/fake/llm.js";
import { fakeTts } from "../src/adapters/fake/tts.js";
import { systemClock } from "../src/kernel/clock.js";
import { openDb } from "../src/kernel/db/index.js";
import { migrate } from "../src/kernel/db/migrate.js";
import { ulidIds } from "../src/kernel/ids.js";
import { ensureDirs, layout } from "../src/kernel/paths.js";
import { attemptsOf, sqliteAttempts } from "../src/kernel/runner/attempt-repo.js";
import type { StageContext } from "../src/kernel/runner/index.js";
import { piecesOf } from "../src/kernel/runner/piece-repo.js";
import { stageProviders } from "../src/kernel/runner/providers.js";
import { startRun } from "../src/slices/admission/start.js";
import { prepareProvidedArticleSegments } from "../src/slices/article/provided-entries.js";
import { runNarration } from "../src/slices/narration/run.js";
import { outputsOf } from "../src/slices/storage/repo.js";
import { recordingCounter } from "../src/slices/telemetry/record.fake.js";
import { binary, wavParts } from "../src/slices/video/export.fake.js";
import { renderVideo } from "../src/slices/video/run.js";

it("narrates text and LLM entries around a provided article and includes both in WAV", async () => {
  const paths = layout(mkdtempSync(join(tmpdir(), "slopify-entry-narration-")));
  ensureDirs(paths, { mode: 0o700 });
  const db = openDb(paths.db);
  try {
    migrate(db, systemClock);
    const tone = join(paths.dataDir, "tone.mp3");
    execFileSync(binary, [
      "-v",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:duration=0.3:sample_rate=44100",
      tone,
    ]);
    const tts = fakeTts({ bytesFor: () => [new Uint8Array(readFileSync(tone))] });
    const llm = fakeLlm({ deltas: ["Thanks for watching."] });
    const counted = recordingCounter();
    const deps = {
      db,
      paths,
      ids: ulidIds,
      clock: systemClock,
      log: { write: () => {} },
      emit: () => {},
      count: counted.count,
      ffmpeg: binary,
    };
    const { project, stages } = startRun(
      deps,
      {
        title: "Rope",
        format: "16:9",
        sources: {
          research: "off",
          article: "provide",
          audio: "generate",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        llm: { provider: "fake-llm", model: "fake-model" },
        audio: { provider: "fake-tts", model: "fake-voice-model", voice: "narrator" },
        intro: { name: "Greeting", mode: "text" },
        outro: { name: "Ending", mode: "llm" },
        imagePrompts: [],
        values: {},
        provided: { article: "Rope is twisted fibre." },
        silenceGapSeconds: 0.2,
      },
      { intro: "Welcome to the channel.", outro: "Write a sign-off." },
    );
    const audio = stages.find((stage) => stage.kind === "audio");
    const article = stages.find((stage) => stage.kind === "article");
    const video = stages.find((stage) => stage.kind === "video");
    if (!audio || !article || !video) throw new Error("Missing stage");
    const context: StageContext = {
      stage: audio,
      signal: new AbortController().signal,
      emit: () => {},
    };
    const providers = stageProviders(
      {
        registry: {
          llm: () => llm,
          tts: () => tts,
          image: () => {
            throw new Error("No image requests");
          },
          list: async () => [],
        },
        attempts: sqliteAttempts(db, ulidIds),
        clock: systemClock,
        log: deps.log,
      },
      context,
    );
    await prepareProvidedArticleSegments(deps, context, providers);
    await runNarration(deps, context, providers);
    await renderVideo(deps, { ...context, stage: video });

    expect(llm.calls()).toBe(1);
    expect(tts.seen()).toEqual([
      "Rope is twisted fibre.",
      "Welcome to the channel.",
      "Thanks for watching.",
    ]);
    expect(piecesOf(db, article.id, "segment")).toHaveLength(2);
    const outputs = outputsOf(db, project.id);
    expect(outputs.map((output) => output.role)).toEqual(
      expect.arrayContaining(["audio_intro", "audio_body", "audio_outro", "audio_export"]),
    );
    const wav = wavParts(join(paths.projects, project.id, "audio.wav"));
    expect(wav.signature).toBe("RIFF");
    const duration = (role: string): number =>
      (outputs.find((output) => output.role === role)?.durationMs ?? 0) / 1000;
    expect(wav.duration).toBeCloseTo(
      duration("audio_intro") + duration("audio_body") + duration("audio_outro") + 0.4,
      1,
    );
    expect(wav.peakAt(0.1)).toBeGreaterThan(100);
    expect(wav.peakAt(duration("audio_intro") + 0.1)).toBe(0);
    expect(wav.peakAt(duration("audio_intro") + 0.3)).toBeGreaterThan(100);
    expect(attemptsOf(db, project.id).every((attempt) => attempt.stageId === audio.id)).toBe(true);
    expect(counted.events().filter((event) => event.counters.stage === "video")).toHaveLength(0);
  } finally {
    db.close();
    rmSync(paths.dataDir, { recursive: true, force: true });
  }
});
