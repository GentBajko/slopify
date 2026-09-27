import { describe, expect, it } from "vitest";
import { fakeLlm } from "../../adapters/fake/llm.js";
import { manualClock } from "../clock.fake.js";
import type { Log } from "../log.js";
import type { StageKind } from "../pipeline.js";
import type { LlmEvent, LlmPort } from "../ports/llm.js";
import { providerError } from "../ports/model.js";
import type { PlanLimitHit } from "../ports/plan-limits.js";
import type { Registry } from "../ports/registry.js";
import type { AttemptEnd, AttemptStore } from "./attempt-repo.js";
import type { StageContext } from "./index.js";
import type { LimitGate, MeteredCall } from "./meter.js";
import { stageProviders } from "./providers.js";

const log: Log = { write: () => {} };

function attempts(): AttemptStore & { readonly outcomes: string[] } {
  const outcomes: string[] = [];
  return {
    outcomes,
    start: () => `a${outcomes.length}`,
    end: (_id: string, ended: AttemptEnd) => {
      outcomes.push(ended.outcome);
    },
  };
}

function registry(llm: LlmPort): Registry {
  return {
    llm: () => llm,
    tts: () => {
      throw new Error("no tts");
    },
    image: () => {
      throw new Error("no image");
    },
    list: () => Promise.resolve([]),
  };
}

function context(kind: StageKind): StageContext {
  const work = {
    projectId: "p1",
    kind,
    stageId: `s-${kind}`,
    revisionId: "r1",
    workId: "w1",
    fingerprint: kind,
  };
  return {
    stage: { id: `s-${kind}`, projectId: "p1", kind, state: "running", work },
    work,
    maySubmit: () => true,
    signal: new AbortController().signal,
    emit: () => {},
  };
}

function port(id: string, events: () => AsyncGenerator<LlmEvent>): LlmPort {
  return {
    id,
    capabilities: { streams: true, reportsUsage: true, webSearch: false },
    models: () => Promise.resolve([]),
    complete: events,
  };
}

describe("metering provider calls", () => {
  it("records what a successful call used, with the plan windows it reported", async () => {
    const metered: MeteredCall[] = [];
    const clock = manualClock();
    const provider = stageProviders(
      {
        registry: registry(
          port("claude-code", async function* () {
            yield { type: "delta", text: "Hi" };
            yield {
              type: "done",
              usage: {
                inputTokens: 100,
                outputTokens: 10,
                cachedInputTokens: 60,
                model: "claude-x",
              },
              finishReason: "end_turn",
              limits: { after: [{ kind: "weekly", usedPercent: 12, resetsAt: null }] },
            };
          }),
        ),
        attempts: attempts(),
        clock,
        log,
        meter: { record: (call) => metered.push(call) },
      },
      context("article"),
    );
    const answer = await provider.llm({ provider: "claude-code", model: "sonnet", messages: [] });
    expect(answer.ok).toBe(true);
    expect(metered).toEqual([
      {
        projectId: "p1",
        stage: "article",
        kind: "llm",
        provider: "claude-code",
        model: "claude-x",
        tokensIn: 100,
        tokensOut: 10,
        cachedTokens: 60,
        wallMs: 0,
        limits: { after: [{ kind: "weekly", usedPercent: 12, resetsAt: null }] },
      },
    ]);
  });

  it("never fails a call because recording it failed", async () => {
    const provider = stageProviders(
      {
        registry: registry(fakeLlm()),
        attempts: attempts(),
        clock: manualClock(),
        log,
        meter: {
          record: () => {
            throw new Error("disk full");
          },
        },
      },
      context("article"),
    );
    expect((await provider.llm({ provider: "openrouter", model: "m", messages: [] })).ok).toBe(
      true,
    );
  });
});

describe("living within plan limits", () => {
  it("waits for a used-up plan at the gate, then makes the call afresh", async () => {
    let calls = 0;
    const hits: PlanLimitHit[] = [];
    const ready: string[] = [];
    const gate: LimitGate = {
      ready: async (account) => {
        ready.push(account);
      },
      exhausted: (hit) => {
        hits.push(hit);
      },
    };
    const clock = manualClock();
    const recorded = attempts();
    const provider = stageProviders(
      {
        registry: registry(
          port("codex", async function* () {
            calls += 1;
            if (calls === 1)
              throw providerError({
                kind: "rate_limit",
                message: "Your Codex plan's usage limit is used up.",
                planLimit: { account: "codex", resetsAt: "2026-09-02T14:00:00.000Z" },
              });
            yield { type: "delta", text: "Back" };
            yield { type: "done", usage: null, finishReason: null };
          }),
        ),
        attempts: recorded,
        clock,
        log,
        limits: gate,
      },
      context("article"),
    );
    const answer = await clock.settle(
      provider.llm({ provider: "codex", model: "gpt", messages: [] }),
    );
    expect(answer).toMatchObject({ ok: true, value: { text: "Back" } });
    expect(hits).toEqual([{ account: "codex", resetsAt: "2026-09-02T14:00:00.000Z" }]);
    expect(ready).toEqual(["codex", "codex"]);
    // Not retried on the attempt policy's backoff: the gate is what waits.
    // (the only waits are each attempt's own 120 s deadline, never the 2 s retry backoff).
    expect(clock.waits).not.toContain(2000);
    expect(recorded.outcomes).toEqual(["rate_limit", "ok"]);
  });

  it("does not hold a keyed provider at the gate", async () => {
    const gate: LimitGate = {
      ready: () => Promise.reject(new Error("a keyed provider must not wait")),
      exhausted: () => {},
    };
    const provider = stageProviders(
      {
        registry: registry(fakeLlm()),
        attempts: attempts(),
        clock: manualClock(),
        log,
        limits: gate,
      },
      context("article"),
    );
    expect((await provider.llm({ provider: "openrouter", model: "m", messages: [] })).ok).toBe(
      true,
    );
  });
});
