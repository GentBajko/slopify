import type { CostEstimate } from "@app/slices/estimate/index.js";
import type { RunCost } from "@app/slices/run-cost/panel.js";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RunReview } from "@/play/run-review";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { limitWaitMessage, planLine, planUse, RunCostPanel, usage } from "./run-cost";

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
