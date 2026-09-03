import { describe, expect, it } from "vitest";
import { fakeImage } from "../../adapters/fake/image.js";
import { fakeLlm } from "../../adapters/fake/llm.js";
import { fakeTts } from "../../adapters/fake/tts.js";
import type { ManualClock } from "../clock.fake.js";
import { manualClock } from "../clock.fake.js";
import type { ProjectEvent } from "../events.js";
import type { Log } from "../log.js";
import type { StageKind, StageState } from "../pipeline.js";
import { stageKinds } from "../pipeline.js";
import type { ImagePort } from "../ports/image.js";
import type { LlmEvent, LlmPort } from "../ports/llm.js";
import type { Registry } from "../ports/registry.js";
import type { TtsPort } from "../ports/tts.js";
import type { Attempt, AttemptEnd, AttemptStart, AttemptStore } from "./attempt-repo.js";
import type { RunnerStage, StageContext, StageRun, StageStore } from "./index.js";
import { createRunner } from "./index.js";
import { stageProviders } from "./providers.js";

const log: Log = { write: (): void => {} };

interface Recorder extends AttemptStore {
  readonly rows: readonly Attempt[];
}

function recorder(): Recorder {
  const rows: Attempt[] = [];
  return {
    rows,
    start: (start: AttemptStart): string => {
      const id = `a${rows.length + 1}`;
      rows.push({ ...start, id, endedAt: null, outcome: null, errorText: null });
      return id;
    },
    end: (id: string, ended: AttemptEnd): void => {
      const at = rows.findIndex((row) => row.id === id);
      const row = rows[at];
      if (row !== undefined) {
        rows[at] = { ...row, ...ended };
      }
    },
  };
}

interface Ports {
  readonly llm?: LlmPort;
  readonly tts?: TtsPort;
  readonly image?: ImagePort;
}

function registry(ports: Ports): Registry {
  const found = <T>(port: T | undefined, id: string): T => {
    if (port === undefined) {
      throw new Error(`no adapter is registered for ${id}`);
    }
    return port;
  };
  return {
    llm: (id: string) => found(ports.llm, id),
    tts: (id: string) => found(ports.tts, id),
    image: (id: string) => found(ports.image, id),
    list: () => Promise.resolve([]),
  };
}

function context(kind: StageKind, signal: AbortSignal): StageContext {
  return {
    stage: { id: `s-${kind}`, projectId: "p1", kind, state: "running" },
    signal,
    emit: (): void => {},
  };
}

interface Harness {
  readonly clock: ManualClock;
  readonly attempts: Recorder;
  readonly controller: AbortController;
}

function harness(): Harness {
  return { clock: manualClock(), attempts: recorder(), controller: new AbortController() };
}

describe("stageProviders", () => {
  it("gives the stage the whole answer and every event on the way", async () => {
    const h = harness();
    const llm = fakeLlm({ deltas: ["Once ", "upon ", "a time"] });
    const providers = stageProviders(
      { registry: registry({ llm }), attempts: h.attempts, clock: h.clock, log },
      context("article", h.controller.signal),
    );
    const events: LlmEvent[] = [];

    const answer = await h.clock.settle(
      providers.llm(
        { provider: "fake-llm", model: "fake-model", messages: [{ role: "user", content: "hi" }] },
        (event) => events.push(event),
      ),
    );

    expect(answer.text).toBe("Once upon a time");
    expect(answer.usage).toEqual({ inputTokens: 11, outputTokens: 22 });
    expect(answer.finishReason).toBe("stop");
    expect(events.filter((event) => event.type === "delta")).toHaveLength(3);
    expect(h.attempts.rows.map((row) => row.outcome)).toEqual(["ok"]);
    expect(h.attempts.rows[0]?.stageId).toBe("s-article");
  });

  it("retries a failing call by the policy and records every attempt", async () => {
    const h = harness();
    const llm = fakeLlm({
      failOnAttempt: {
        1: { kind: "rate_limit", message: "429 slow down", retryAfterMs: 5000 },
        2: { kind: "other", message: "socket hang up" },
      },
    });
    const providers = stageProviders(
      { registry: registry({ llm }), attempts: h.attempts, clock: h.clock, log },
      context("article", h.controller.signal),
    );

    const answer = await h.clock.settle(
      providers.llm({ provider: "fake-llm", model: "fake-model", messages: [] }),
    );

    expect(answer.text).toBe("Hello world");
    expect(llm.calls()).toBe(3);
    expect(h.attempts.rows.map((row) => row.outcome)).toEqual(["rate_limit", "other", "ok"]);
    // The provider's Retry-After, then the schedule's second wait.
    expect(h.clock.now().toISOString()).toBe("2026-09-02T10:00:13.000Z");
  });

  it("drains a narration stream into bytes", async () => {
    const h = harness();
    const tts = fakeTts({ chunks: ["fake ", "audio"] });
    const providers = stageProviders(
      { registry: registry({ tts }), attempts: h.attempts, clock: h.clock, log },
      context("audio", h.controller.signal),
    );

    const audio = await h.clock.settle(
      providers.tts({ provider: "fake-tts", voiceId: "v1", text: "read this" }),
    );

    expect(new TextDecoder().decode(audio.bytes)).toBe("fake audio");
    expect(audio.container).toBe("mp3");
    expect(tts.seen()).toEqual(["read this"]);
  });

  it("records an image's attempts against its own piece", async () => {
    const h = harness();
    const image = fakeImage({ bytes: new Uint8Array([1, 2, 3]) });
    const providers = stageProviders(
      { registry: registry({ image }), attempts: h.attempts, clock: h.clock, log },
      context("images", h.controller.signal),
    );

    const made = await h.clock.settle(
      providers.forPiece("image-3").image({
        provider: "fake-image",
        model: "fake-diffusion",
        prompt: "a cat",
        aspect: "16:9",
      }),
    );

    expect([...made.bytes]).toEqual([1, 2, 3]);
    expect(image.seen()[0]?.aspect).toBe("16:9");
    expect(h.attempts.rows[0]?.pieceId).toBe("image-3");
  });
});

// The runner path a stage's `run` takes, with the wrapper in it.
describe("a stage running through the wrapper", () => {
  interface Wired {
    readonly states: Map<StageKind, { state: StageState; reason: string | null }>;
    readonly tick: () => void;
    readonly settled: () => Promise<void>;
    readonly abortAll: () => Promise<void>;
  }

  function wire(kind: StageKind, run: StageRun): Wired {
    const states = new Map<StageKind, { state: StageState; reason: string | null }>();
    // Every other stage is done, so the one under test is the only one the graph starts.
    const rows: RunnerStage[] = stageKinds.map((each) => ({
      id: `s-${each}`,
      projectId: "p1",
      kind: each,
      state: each === kind ? "pending" : "done",
    }));
    const stages: StageStore = {
      stagesOf: () => rows,
      claim: (stageId: string): boolean => {
        const at = rows.findIndex((row) => row.id === stageId);
        const row = rows[at];
        if (row === undefined || row.state !== "pending") {
          return false;
        }
        rows[at] = { ...row, state: "running" };
        return true;
      },
      finish: (stageId: string, state: StageState, failureReason: string | null): void => {
        const at = rows.findIndex((row) => row.id === stageId);
        const row = rows[at];
        if (row !== undefined) {
          rows[at] = { ...row, state };
          states.set(row.kind, { state, reason: failureReason });
        }
      },
    };
    const runs: Partial<Record<StageKind, StageRun>> = {};
    runs[kind] = run;
    const runner = createRunner({
      stages,
      runs,
      emit: (_projectId: string, _event: ProjectEvent): void => {},
      emitRunningCount: (): void => {},
      log,
    });
    return {
      states,
      tick: () => runner.tick("p1"),
      settled: () => runner.settled(),
      abortAll: () => runner.abortAll(),
    };
  }

  // logic/13 step 3: a call aborted mid-flight leaves the stage `canceled`.
  it("leaves the stage canceled when the cancel lands mid-attempt", async () => {
    const h = harness();
    const llm = fakeLlm({ deltas: ["a", "b"], gapMs: 60_000, clock: h.clock });
    const attempts = h.attempts;
    const clock = h.clock;
    const run: StageRun = async (stageContext: StageContext): Promise<void> => {
      const providers = stageProviders(
        { registry: registry({ llm }), attempts, clock, log },
        stageContext,
      );
      await providers.llm({ provider: "fake-llm", model: "fake-model", messages: [] });
    };
    const wired = wire("article", run);

    wired.tick();
    // Let the stage reach its provider call: the fake is asleep on the first gap.
    await h.clock.settle(Promise.resolve());
    expect(llm.calls()).toBe(1);

    await h.clock.settle(wired.abortAll());

    expect(wired.states.get("article")).toEqual({ state: "canceled", reason: "canceled by user" });
    expect(attempts.rows.map((row) => row.outcome)).toEqual(["canceled"]);
  });

  // logic/09 §Q74: the stage fails at once with the refusal, and the page shows it.
  it("fails the stage with the provider's refusal, once, without retrying", async () => {
    const h = harness();
    const image = fakeImage({ refuse: "I can't create that image." });
    const attempts = h.attempts;
    const clock = h.clock;
    const run: StageRun = async (stageContext: StageContext): Promise<void> => {
      const providers = stageProviders(
        { registry: registry({ image }), attempts, clock, log },
        stageContext,
      );
      await providers.image({
        provider: "fake-image",
        model: "fake-diffusion",
        prompt: "a cat",
        aspect: "9:16",
      });
    };
    const wired = wire("images", run);

    wired.tick();
    await h.clock.settle(wired.settled());

    expect(wired.states.get("images")).toEqual({
      state: "failed",
      reason: "I can't create that image.",
    });
    expect(image.calls()).toBe(1);
    expect(attempts.rows).toHaveLength(1);
  });
});
