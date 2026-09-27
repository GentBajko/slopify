import { describe, expect, it } from "vitest";
import type { LlmEvent } from "../../kernel/ports/llm.js";
import { isProviderError } from "../../kernel/ports/model.js";
import type { LimitWindow } from "../../kernel/ports/plan-limits.js";
import { codexLlm } from "./codex.js";
import { codexPlanLimit, codexWindows } from "./codex-limits.js";
import type { CliRun, RunCli } from "./run-cli.js";

// The `account/rateLimits/read` reply recorded from codex-cli 0.155.1 on a ChatGPT Pro plan
// (account ids removed): one weekly window, no 5-hour one.
const recordedRead = {
  ordinaryUsageAllowed: true,
  rateLimits: {
    limitId: "codex",
    limitName: null,
    normalModelSlug: null,
    primary: { usedPercent: 1, windowDurationMins: 10080, resetsAt: 1791064173 },
    secondary: null,
    credits: { hasCredits: false, unlimited: false, balance: "0" },
    individualLimit: null,
    spendControlReached: false,
    planType: "pro",
    rateLimitReachedType: null,
  },
};

describe("codexWindows", () => {
  it("reads the recorded app-server reply into named windows", () => {
    expect(codexWindows(recordedRead)).toEqual([
      { kind: "weekly", usedPercent: 1, resetsAt: "2026-10-03T21:49:33.000Z" },
    ]);
  });
  it("names a 5-hour window and ignores a reply it does not know", () => {
    expect(
      codexWindows({
        rateLimits: {
          primary: { usedPercent: 42.5, windowDurationMins: 300, resetsAt: 1791064173 },
          secondary: { usedPercent: 7, windowDurationMins: 10080, resetsAt: null },
        },
      }),
    ).toEqual([
      { kind: "five_hour", usedPercent: 42.5, resetsAt: "2026-10-03T21:49:33.000Z" },
      { kind: "weekly", usedPercent: 7, resetsAt: null },
    ]);
    expect(codexWindows({ something: "else" })).toEqual([]);
  });
});

describe("codexPlanLimit", () => {
  const now = new Date(2026, 8, 27, 10, 0);
  it("reads the reset from the CLI's own message, with or without a date", () => {
    expect(
      codexPlanLimit(
        "You've hit your usage limit. Upgrade to Plus to continue using Codex, or try again at Sep 28th, 2026 3:04 PM.",
        now,
      ),
    ).toEqual({ account: "codex", resetsAt: new Date(2026, 8, 28, 15, 4).toISOString() });
    expect(codexPlanLimit("You've hit your usage limit. Try again at 2:30 PM.", now)).toEqual({
      account: "codex",
      resetsAt: new Date(2026, 8, 27, 14, 30).toISOString(),
    });
    // A time already past today is tomorrow's.
    expect(codexPlanLimit("You've hit your usage limit. Try again at 9:15 AM.", now)).toEqual({
      account: "codex",
      resetsAt: new Date(2026, 8, 28, 9, 15).toISOString(),
    });
  });
  it("still waits when no time is given, and ignores every other failure", () => {
    expect(codexPlanLimit("You've hit your usage limit.", now)).toEqual({
      account: "codex",
      resetsAt: null,
    });
    expect(codexPlanLimit("stream disconnected before completion", now)).toBeUndefined();
  });
});

function replaying(lines: readonly string[]): RunCli {
  return (): CliRun => {
    const bytes = new TextEncoder().encode(`${lines.join("\n")}\n`);
    return {
      pid: 1,
      stdout: {
        async *[Symbol.asyncIterator](): AsyncGenerator<Uint8Array> {
          yield bytes;
        },
      },
      stderr: () => "",
      ended: Promise.resolve({ code: 0, error: null }),
      kill: () => {},
    };
  };
}

async function drain(run: RunCli, readLimits?: () => Promise<LimitWindow[] | null>) {
  const out: LlmEvent[] = [];
  for await (const event of codexLlm({ run, readLimits }).complete({
    model: "gpt-5.6-sol",
    messages: [{ role: "user", content: "Hi" }],
    signal: new AbortController().signal,
  }))
    if (event.type !== "activity") out.push(event);
  return out;
}

describe("codexLlm and the plan", () => {
  it("reports the windows read before and after the call", async () => {
    const readings = [
      [{ kind: "weekly", usedPercent: 10, resetsAt: "2026-10-03T21:49:33.000Z" }],
      [{ kind: "weekly", usedPercent: 11, resetsAt: "2026-10-03T21:49:33.000Z" }],
    ] as const satisfies readonly (readonly LimitWindow[])[];
    let read = 0;
    const events = await drain(
      replaying([
        '{"type":"item.completed","item":{"type":"agent_message","text":"Hello"}}',
        '{"type":"turn.completed","usage":{"input_tokens":10,"output_tokens":2}}',
      ]),
      async () => [...(readings[read++] ?? [])],
    );
    expect(events.at(-1)).toEqual({
      type: "done",
      usage: { inputTokens: 10, outputTokens: 2 },
      finishReason: null,
      limits: { before: readings[0], after: readings[1] },
    });
  });

  it("turns a used-up plan into a wait, not a failure", async () => {
    const error: unknown = await drain(
      replaying([
        JSON.stringify({
          type: "turn.failed",
          error: { message: "You've hit your usage limit. Try again at Sep 28th, 2026 3:04 PM." },
        }),
      ]),
    ).catch((thrown: unknown) => thrown);
    expect(isProviderError(error) && error.fault).toEqual({
      kind: "rate_limit",
      planLimit: { account: "codex", resetsAt: new Date(2026, 8, 28, 15, 4).toISOString() },
    });
    expect(String(error)).toContain("waits for it to reset");
  });
});
