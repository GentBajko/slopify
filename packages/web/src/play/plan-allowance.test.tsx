import { cleanup, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { freshForm } from "@/play/state";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PlanAllowance } from "./plan-allowance";

afterEach(cleanup);

const week = {
  since: "2026-09-28T00:00:00.000Z",
  videos: 0,
  calls: 0,
  cost: 0,
  unpriced: 0,
  apiEquivalent: null,
  plans: [
    {
      account: "codex",
      name: "Codex",
      weeklyPercent: 42.4,
      fiveHourPercent: null,
      weeklyResetsAt: null,
      readAt: "2026-10-03T12:00:00.000Z",
    },
    {
      account: "gemini",
      name: "Gemini CLI",
      weeklyPercent: 10,
      fiveHourPercent: null,
      weeklyResetsAt: null,
      readAt: "2026-10-03T12:00:00.000Z",
    },
  ],
};

it("says how much of the setup's CLI plan its last reading showed used", async () => {
  renderApp(
    <PlanAllowance form={{ ...freshForm, llm: { ...freshForm.llm, provider: "codex" } }} />,
    testDeps({ "GET /api/home/week": jsonAnswer(week) }),
  );
  expect((await screen.findByRole("list", { name: "Plan limits used" })).textContent).toMatch(
    /^Codex: 42% of the weekly limit used at its last reading/,
  );
  expect(screen.queryByText(/Gemini CLI/)).toBeNull();
});

it("says nothing for a setup on API keys", () => {
  renderApp(
    <PlanAllowance form={{ ...freshForm, llm: { ...freshForm.llm, provider: "openrouter" } }} />,
    testDeps({ "GET /api/home/week": jsonAnswer(week) }),
  );
  expect(screen.queryByRole("list", { name: "Plan limits used" })).toBeNull();
});
