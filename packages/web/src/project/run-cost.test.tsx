import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunReview } from "@/play/run-review";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import {
  limitWaitMessage,
  planLine,
  planUse,
  RunClock,
  RunCostPanel,
  RunCostSummary,
  usage,
} from "./run-cost";

afterEach(cleanup);

describe("the plan-limit status line", () => {
  it("names the CLI and when it resets", () => {
    const message = limitWaitMessage([
      {
        account: "codex",
        name: "Codex",
        stage: "images",
        resetsAt: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
        retryAt: new Date(new Date().setHours(14, 2, 0, 0)).toISOString(),
      },
    ]);
    const at = new Date(new Date().setHours(14, 0, 0, 0));
    const time = at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
    expect(message?.startsWith(`Waiting for Codex limits (resets at ${time}).`)).toBe(true);
    expect(message).toContain("carries on by itself");
    expect(limitWaitMessage([])).toBeUndefined();
  });
  it("says when it checks again if the CLI gave no reset time", () => {
    expect(
      limitWaitMessage([
        {
          account: "gemini",
          name: "Gemini",
          stage: "article",
          resetsAt: null,
          retryAt: new Date(new Date().setHours(10, 30, 0, 0)).toISOString(),
        },
      ]),
    ).toContain("Waiting for Gemini limits (checking again at ");
  });
});

describe("the Run cost summary", () => {
  it("shows a CLI run as $0 on the plan with its API price", () => {
    expect(planLine({ apiEquivalent: 1.234, apiUnpriced: 0 })).toBe(
      "CLI calls: $0 on your plan · ~$1.23 via API.",
    );
    expect(planLine({ apiEquivalent: 0, apiUnpriced: 2 })).toBe(
      "CLI calls: $0 on your plan · no API price is listed for their models.",
    );
  });
  it("says how much of a plan window the run took, or plainly that it is not known", () => {
    expect(
      planUse({
        account: "codex",
        name: "Codex",
        calls: 3,
        reported: true,
        windows: [{ kind: "weekly", usedPercent: 4, nowPercent: 15, resetsAt: null }],
      }),
    ).toBe("This run used ~4% of your weekly Codex limit (now at 15%).");
    expect(
      planUse({ account: "claude-code", name: "Claude", calls: 1, reported: false, windows: [] }),
    ).toContain("did not report its plan limits");
  });
  it("lists usage in plain units", () => {
    expect(
      usage({
        tokensIn: 25_000,
        tokensOut: 1200,
        cachedTokens: 12_000,
        characters: 900,
        images: 1,
        seconds: 10,
      }),
    ).toBe("25K in / 1,200 out tokens (12K cached) · 900 characters · 1 image · 10 s of video");
  });
});

describe("the Run cost tab", () => {
  const line = {
    calls: 2,
    cost: 0,
    unpriced: 0,
    apiEquivalent: 1.5,
    apiUnpriced: 0,
    tokensIn: 25_000,
    tokensOut: 1200,
    cachedTokens: 0,
    characters: 0,
    images: 0,
    seconds: 0,
  };
  const cost: RunCost = {
    ...line,
    cost: 3.37,
    currency: "USD",
    totals: { ...line, wallMs: 540_000 },
    byStage: [{ ...line, stage: "article", wallMs: 360_000 }],
    byModel: [
      {
        ...line,
        provider: "codex",
        model: "gpt-5",
        kind: "llm",
        onPlan: true,
        apiModel: null,
      },
    ],
    plans: [
      {
        account: "codex",
        name: "Codex",
        calls: 2,
        reported: true,
        windows: [{ kind: "weekly", usedPercent: 18, nowPercent: 40, resetsAt: null }],
      },
    ],
    waits: [],
    catalogueDate: "2026-09-27",
    run: {
      current: true,
      startedAt: "2026-09-27T10:00:00.000Z",
      endedAt: "2026-09-27T10:36:00.000Z",
      spanMs: 36 * 60_000,
      workingMs: 9 * 60_000,
    },
  };

  it("leads with paid, via API, the plan meter and the end-to-end time, then the tables", async () => {
    renderApp(
      <RunCostPanel projectId="p1" />,
      testDeps({ "GET /api/projects/p1/run-cost": jsonAnswer(cost) }),
    );
    const summary = await screen.findByRole("region", { name: "Run cost summary" });
    const stats = within(summary)
      .getAllByRole("definition")
      .map((value) => value.textContent);
    expect(stats).toContain("$3.37");
    expect(stats).toContain("~$1.50");
    expect(stats).toContain("18%");
    expect(stats).toContain("36 min 0 s");
    expect(stats).toContain("9 min 0 s");
    const meter = within(summary).getByRole("meter", {
      name: "Share of the weekly Codex limit this run used",
    });
    expect(meter.getAttribute("aria-valuenow")).toBe("18");
    const byStage = screen.getByRole("table", { name: "Run cost by stage" });
    expect(within(byStage).getByText("~$1.50")).toBeTruthy();
    expect(within(byStage).getByText("6 min 0 s")).toBeTruthy();
    const byModel = screen.getByRole("table", { name: "Run cost by model" });
    expect(within(byModel).getByText("codex · gpt-5")).toBeTruthy();
    expect(within(byModel).getByText("$0 on plan")).toBeTruthy();
  });

  it("sums the finished run up in one line on the project page, linking to the tab", async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<RunCostSummary cost={cost} status="done" onOpen={onOpen} />);
    const line = screen.getByRole("region", { name: "Run cost" });
    expect(line.textContent).toContain(
      "This run cost $3.37 · ~$1.50 via API · took 36 min 0 s (9 min 0 s working)",
    );
    await user.click(within(line).getByRole("button", { name: "See cost by stage" }));
    expect(onOpen).toHaveBeenCalledOnce();
    cleanup();
    render(<RunCostSummary cost={cost} status="failed" onOpen={onOpen} />);
    expect(screen.getByRole("region", { name: "Run cost" }).textContent).toContain(
      "Spent so far $3.37",
    );
  });

  it("stays away while the run goes on or before anything was spent", () => {
    for (const status of ["running", "paused", "pending"] as const) {
      render(<RunCostSummary cost={cost} status={status} onOpen={() => undefined} />);
      expect(screen.queryByRole("region", { name: "Run cost" })).toBeNull();
      cleanup();
    }
    render(
      <RunCostSummary
        cost={{ ...cost, calls: 0, byStage: [] }}
        status="done"
        onOpen={() => undefined}
      />,
    );
    expect(screen.queryByRole("region", { name: "Run cost" })).toBeNull();
  });
});

describe("the run clock", () => {
  it("ticks start to finish every second, and working only while a step runs", () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-27T10:12:00.000Z") });
    try {
      const measuredAt = Date.now();
      const running = (endedAt: string | null) =>
        ({
          run: {
            current: true,
            startedAt: "2026-09-27T10:00:00.000Z",
            endedAt,
            spanMs: 0,
            workingMs: 5 * 60_000,
          },
        }) as RunCost;
      render(<RunClock cost={running(null)} status="running" measuredAt={measuredAt} />);
      const clock = screen.getByRole("timer", { name: "Run time" });
      expect(clock.textContent).toBe("Running for 12 min 0 s · 5 min 0 s working");
      act(() => vi.advanceTimersByTime(5000));
      expect(clock.textContent).toBe("Running for 12 min 5 s · 5 min 5 s working");
      cleanup();
      // Waiting on a review: the run goes on, the work does not.
      render(
        <RunClock
          cost={running("2026-09-27T10:05:00.000Z")}
          status="paused"
          measuredAt={measuredAt}
        />,
      );
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("timer").textContent).toBe(
        "Started 12 min 10 s ago · 5 min 0 s working",
      );
      cleanup();
      render(<RunClock cost={running(null)} status="done" measuredAt={measuredAt} />);
      expect(screen.queryByRole("timer")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("the estimate before Start", () => {
  it("shows CLI steps as $0 on the plan with the API figure beside them", () => {
    const estimate: CostEstimate = {
      currency: "USD",
      rows: [
        {
          stage: "Article",
          low: 0,
          high: 0,
          detail: "Runs on your CLI plan.",
          onPlan: true,
          apiLow: 0.1,
          apiHigh: 0.3,
        },
        { stage: "Narration", low: 1, high: 1, detail: "Keyed." },
      ],
      low: 1,
      high: 1,
      unknown: 0,
      apiLow: 0.1,
      apiHigh: 0.3,
      apiUnknown: 0,
      expectedWords: 1500,
      catalogueDate: "2026-09-26",
      assumptions: [],
    };
    render(<RunReview estimates={[estimate]} />);
    expect(screen.getByText("$0 on your plan · ~$0.10 – $0.30 via API")).toBeTruthy();
    expect(screen.getByText("CLI steps: $0 on your plan · ~$0.10 – $0.30 via API.")).toBeTruthy();
  });
});
