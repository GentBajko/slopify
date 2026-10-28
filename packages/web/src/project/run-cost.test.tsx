import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { PlanWindowUse, RunCost } from "@app/slices/run-cost/panel.js";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RunReview } from "@/play/run-review";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { planLine, planUse, RunClock, RunCostPanel, usage } from "./run-cost";

afterEach(cleanup);

const weekly: PlanWindowUse = {
  kind: "weekly",
  usedPercent: 4,
  basis: "measured",
  sharedCalls: 0,
  fromPercent: 11,
  accountPercent: 4,
  rolledOver: false,
  nowPercent: 15,
  resetsAt: null,
};

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
        windows: [{ ...weekly, usedPercent: 4, fromPercent: 11, accountPercent: 4 }],
      }),
    ).toBe(
      "This run used 4% of your weekly Codex limit, from each call's own readings. Codex weekly: 11% → 15% while this ran (all use on this account).",
    );
    expect(
      planUse({ account: "claude-code", name: "Claude", calls: 1, reported: false, windows: [] }),
    ).toContain("did not report its plan limits");
  });
  it("says plainly when a share is split, shared with other use, or from older data", () => {
    const plan = (window: Partial<PlanWindowUse>) =>
      planUse({
        account: "claude-code",
        name: "Claude",
        calls: 6,
        reported: true,
        windows: [{ ...weekly, ...window }],
      });
    expect(plan({ basis: "split", usedPercent: 6 })).toContain(
      "This run used about 6% of your weekly Claude limit. Calls that ran at the same time split their rise by tokens.",
    );
    expect(plan({ basis: "shared", usedPercent: null, sharedCalls: 6 })).toContain(
      "This run's share of your weekly Claude limit is shared with other use",
    );
    expect(plan({ basis: "shared", usedPercent: 2, sharedCalls: 3 })).toContain(
      "This run used at least 2% of your weekly Claude limit. 3 calls ran while other calls on this account did",
    );
    // The project the bug was found on: never above 100%, and said to be approximate.
    expect(plan({ basis: "approximate", usedPercent: 45, fromPercent: 40, nowPercent: 85 })).toBe(
      "This project ran before Slopify kept each call's own readings, so its share of your weekly Claude limit is shared with other use on this account: up to 45%. Claude weekly: 40% → 85% while this ran (all use on this account).",
    );
    expect(
      plan({ kind: "five_hour", rolledOver: true, fromPercent: 92, nowPercent: 12 }),
    ).toContain("Claude 5-hour: 92% → 12% while this ran, with a reset in between");
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
        windows: [{ ...weekly, usedPercent: 18, fromPercent: 22, accountPercent: 18 }],
      },
    ],
    waits: [],
    catalogueDate: "2026-09-27",
    run: { current: true, running: false, workingMs: 9 * 60_000 },
  };

  it("leads with what only it says (via API, the plan meter), then the tables, then the totals", async () => {
    renderApp(
      <RunCostPanel projectId="p1" />,
      testDeps({
        "GET /api/projects/p1/run-cost": jsonAnswer(cost),
        "GET /api/providers/codex/models": jsonAnswer({
          models: [{ id: "gpt-5", name: "GPT-5" }],
          allowsCustom: false,
        }),
      }),
    );
    const summary = await screen.findByRole("region", { name: "Run cost summary" });
    const stats = within(summary)
      .getAllByRole("definition")
      .map((value) => value.textContent);
    // The total and the working time are the status column's cost line: not said again here
    // as big numbers, and never as "paid to providers".
    expect(stats).not.toContain("$3.37");
    expect(stats).not.toContain("9 min 0 s");
    expect(stats).toContain("~$1.50");
    expect(stats).toContain("18%");
    expect(document.body.textContent).not.toMatch(/provider/i);
    expect(screen.getByText(/^In total: \$3\.37 · /)).toBeTruthy();
    const meter = within(summary).getByRole("meter", {
      name: "Share of the weekly Codex limit this run used",
    });
    expect(meter.getAttribute("aria-valuenow")).toBe("18");
    const byStage = screen.getByRole("table", { name: "Run cost by step" });
    expect(within(byStage).getByText("~$1.50")).toBeTruthy();
    expect(within(byStage).getByRole("columnheader", { name: "Via API" })).toBeTruthy();
    expect(within(byStage).getByText("6 min 0 s")).toBeTruthy();
    const byModel = screen.getByRole("table", { name: "Run cost by model" });
    // Named as Create names them, from the catalogue.
    expect(await within(byModel).findByText("Codex CLI · GPT-5")).toBeTruthy();
    expect(within(byModel).getByText("$0 on plan")).toBeTruthy();
  });

  it("drops the Via API column when no call has such a figure, and says what the Video step drew", async () => {
    const plain = { ...line, apiEquivalent: null };
    const paid: RunCost = {
      ...cost,
      apiEquivalent: null,
      byStage: [
        { ...plain, stage: "audio", wallMs: 3000 },
        { ...plain, stage: "video", images: 4, wallMs: 1000 },
      ],
      byModel: [
        { ...plain, provider: "fal", model: "flux", kind: "image", onPlan: false, apiModel: null },
      ],
      plans: [],
    };
    renderApp(
      <RunCostPanel projectId="p1" />,
      testDeps({ "GET /api/projects/p1/run-cost": jsonAnswer(paid) }),
    );
    const byStage = await screen.findByRole("table", { name: "Run cost by step" });
    expect(within(byStage).queryByRole("columnheader", { name: "Via API" })).toBeNull();
    expect(
      within(screen.getByRole("table", { name: "Run cost by model" })).queryByRole("columnheader", {
        name: "Via API",
      }),
    ).toBeNull();
    // The shared names: Narration, not Audio.
    expect(within(byStage).getByText("Narration")).toBeTruthy();
    expect(within(byStage).getByText(/4 images for the shorts/)).toBeTruthy();
    // What the tables mean is said in words under their heads, not behind an info button.
    expect(screen.queryByRole("button", { name: /About/ })).toBeNull();
  });

  it("calls a sample's stand-in models free rather than unknown", async () => {
    const sample: RunCost = {
      ...cost,
      byModel: [
        {
          ...line,
          apiEquivalent: null,
          provider: "sample-artist",
          model: "codex-painted",
          kind: "image",
          onPlan: false,
          apiModel: null,
        },
      ],
    };
    renderApp(
      <RunCostPanel projectId="p1" />,
      testDeps({ "GET /api/projects/p1/run-cost": jsonAnswer(sample) }),
    );
    const byModel = await screen.findByRole("table", { name: "Run cost by model" });
    expect(within(byModel).getByText("$0 · sample, free")).toBeTruthy();
    expect(within(byModel).getByText("Sample artist")).toBeTruthy();
  });

  it("says a price nobody knows as Not known, as the make-again review does", async () => {
    const unpriced: RunCost = {
      ...cost,
      unpriced: 3,
      byStage: [
        { ...line, stage: "article", wallMs: 1000, unpriced: 2, apiEquivalent: null },
        { ...line, stage: "audio", wallMs: 1000, cost: 0.4, unpriced: 1, apiEquivalent: null },
      ],
      byModel: [],
      plans: [],
    };
    renderApp(
      <RunCostPanel projectId="p1" />,
      testDeps({ "GET /api/projects/p1/run-cost": jsonAnswer(unpriced) }),
    );
    const byStage = await screen.findByRole("table", { name: "Run cost by step" });
    expect(within(byStage).getByText("Not known")).toBeTruthy();
    expect(within(byStage).getByText("$0.40 + not known")).toBeTruthy();
    expect(byStage.textContent).not.toMatch(/unknown/i);
  });
});

describe("the run clock", () => {
  it("ticks every second while the project runs, and holds still while it waits", () => {
    vi.useFakeTimers({ now: Date.parse("2026-09-27T10:12:00.000Z") });
    try {
      const measuredAt = Date.now();
      const run = (running: boolean) =>
        ({ run: { current: true, running, workingMs: 5 * 60_000 } }) as RunCost;
      render(<RunClock cost={run(true)} status="running" measuredAt={measuredAt} />);
      const clock = screen.getByRole("timer", { name: "Run time" });
      expect(clock.textContent).toBe("Working · 0:05:00");
      act(() => vi.advanceTimersByTime(5000));
      expect(clock.textContent).toBe("Working · 0:05:05");
      cleanup();
      // The project runs but only waits (a plan limit): the server's figure holds, no ticking
      // up to snap back at the next reading.
      render(<RunClock cost={run(false)} status="running" measuredAt={measuredAt} />);
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("timer").textContent).toBe("Working · 0:05:00");
      cleanup();
      // Waiting on a review: no step runs, so no time counts.
      render(<RunClock cost={run(false)} status="paused" measuredAt={measuredAt} />);
      act(() => vi.advanceTimersByTime(5000));
      expect(screen.getByRole("timer").textContent).toBe("5 min 0 s of work so far");
      cleanup();
      render(<RunClock cost={run(true)} status="done" measuredAt={measuredAt} />);
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
