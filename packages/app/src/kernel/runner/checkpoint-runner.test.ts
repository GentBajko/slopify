import { expect, it } from "vitest";
import { manualClock } from "../clock.fake.js";
import type { StageKind } from "../pipeline.js";
import type { Registry } from "../ports/registry.js";
import type { TtsPort } from "../ports/tts.js";
import type { AttemptStart } from "./attempt-repo.js";
import { createRunner, type RunnerStage, type StageRun } from "./index.js";
import { stageProviders } from "./providers.js";
import { createProviderQueue } from "./queue.js";

function fixture(options: { readonly audio?: StageRun; readonly paused?: () => boolean } = {}) {
  const rows: RunnerStage[] = (["audio", "images", "video"] as const).map((kind) => ({
    id: kind,
    projectId: "project",
    kind,
    state: "pending",
    work: {
      projectId: "project",
      revisionId: "revision",
      workId: kind,
      stageId: kind,
      kind,
      fingerprint: kind,
    },
  }));
  const claims: StageKind[] = [];
  const held = new Set<StageKind>(["audio", "video"]);
  const runner = createRunner({
    checkpoints: {
      beforeClaim: (work) =>
        held.has(work.kind)
          ? { kind: "held", checkpointIds: ["before-audio"] }
          : { kind: "eligible" },
      release: () => ({ ok: false, reason: "not-found" }),
    },
    stages: {
      stagesOf: () => rows,
      ready: () => true,
      maySubmit: () => true,
      ...(options.paused ? { paused: options.paused } : {}),
      claim: (work) => {
        const index = rows.findIndex((row) => row.work.workId === work.workId);
        const row = rows[index];
        if (row?.state !== "pending") return false;
        claims.push(row.kind);
        rows[index] = { ...row, state: "running" };
        return true;
      },
      finish: (work, state) => {
        const index = rows.findIndex((row) => row.work.workId === work.workId);
        const row = rows[index];
        if (row) rows[index] = { ...row, state };
      },
    },
    runs: {
      audio: options.audio ?? (async () => "done"),
      images: async () => "done",
      video: async () => "done",
    },
    emit: () => undefined,
    emitRunningCount: () => undefined,
    log: { write: () => undefined },
  });
  return { runner, claims, held, rows };
}

it("holds Audio and its dependent Video while eligible Images claims", async () => {
  const { runner, claims, rows } = fixture();
  runner.tick("project");
  await runner.settled();
  expect(claims).toEqual(["images"]);
  expect(rows.find((row) => row.kind === "audio")?.state).toBe("pending");
  expect(rows.find((row) => row.kind === "video")?.state).toBe("pending");
});

it("duplicate wakeups claim released work only once and respect project pause first", async () => {
  let paused = true;
  const { runner, claims, held } = fixture({ paused: () => paused });
  held.clear();
  runner.tick("project");
  expect(claims).toEqual([]);
  paused = false;
  runner.tick("project");
  runner.tick("project");
  await runner.settled();
  expect(claims).toEqual(["audio", "images", "video"]);
});

function ttsRegistry(tts: TtsPort): Registry {
  return {
    tts: () => tts,
    llm: () => {
      throw new Error("no LLM configured");
    },
    image: () => {
      throw new Error("no image provider configured");
    },
    list: async () => [],
  };
}

it("rechecks checkpoint authority after waiting for provider capacity without starting an attempt", async () => {
  const queue = createProviderQueue(() => 1);
  let releaseCapacity = (): void => {};
  const capacity = new Promise<void>((resolve) => {
    releaseCapacity = resolve;
  });
  const blocker = queue.run("voice", new AbortController().signal, () => capacity);
  const attempts: AttemptStart[] = [];
  let calls = 0;
  const clock = manualClock();
  const { runner, held } = fixture({
    audio: async (context) => {
      const result = await stageProviders(
        {
          queue,
          clock,
          log: { write: () => undefined },
          attempts: {
            start: (input) => {
              attempts.push(input);
              return "attempt";
            },
            end: () => undefined,
          },
          registry: ttsRegistry({
            id: "voice",
            capabilities: { streams: false },
            models: async () => [],
            synthesize: async () => {
              calls++;
              throw new Error("held narration must not be submitted");
            },
          }),
        },
        context,
      ).tts({ provider: "voice", voiceId: "narrator", text: "Hello." });
      return result.ok ? "done" : "held";
    },
  });
  held.delete("audio");
  runner.tick("project");
  held.add("audio");
  releaseCapacity();
  await blocker;
  await runner.settled();
  expect(calls).toBe(0);
  expect(attempts).toEqual([]);
});

it("rechecks checkpoint authority before a retry and preserves the completed attempt", async () => {
  const attempts: AttemptStart[] = [];
  let calls = 0;
  const clock = manualClock();
  const { runner, held } = fixture({
    audio: async (context) => {
      const result = await stageProviders(
        {
          clock,
          queue: createProviderQueue(() => 1),
          log: { write: () => undefined },
          attempts: {
            start: (input) => {
              attempts.push(input);
              return "attempt";
            },
            end: () => undefined,
          },
          registry: ttsRegistry({
            id: "voice",
            capabilities: { streams: false },
            models: async () => [],
            synthesize: async () => {
              calls++;
              held.add("audio");
              throw new Error("temporary transport failure");
            },
          }),
        },
        context,
      ).tts({ provider: "voice", voiceId: "narrator", text: "Hello." });
      return result.ok ? "done" : "held";
    },
  });
  held.delete("audio");
  runner.tick("project");
  await clock.settle(runner.settled());
  expect(calls).toBe(1);
  expect(attempts).toHaveLength(1);
});
