import { templateSections } from "@app/slices/template-studio/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { TemplateStudioPage } from "@/template-studio/page";
import { routes, templateId, view } from "@/template-studio/studio.fake";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

// Library → Templates → Open studio: every control in every section, in the topic and Compare
// models drawers, and beside compared models, has an info button beside it. The walk opens
// each one the way a person would.
function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory])).toEqual([]);
}

const madeSample = {
  ...view,
  sections: view.sections.map((section) => ({ ...section, state: "current" as const })),
  paid: { ...view.paid, state: "done" as const },
};

const bakeoff = {
  bakeoff: {
    id: "b1",
    section: "script",
    version: 3,
    stale: false,
    state: "done",
    sentence: null,
    entries: [
      {
        provider: "openrouter",
        model: "claude",
        slot: null,
        state: "current",
        quotedHigh: null,
        cost: 0.012,
        seconds: 40,
        failure: null,
        outputs: [],
        article: "# Chapter 1\nThe first lighthouse…",
      },
      {
        provider: "openrouter",
        model: "other-model",
        slot: 0,
        state: "done",
        quotedHigh: 0.01,
        cost: 0.009,
        seconds: 31,
        failure: null,
        outputs: [],
        article: "# Chapter 1\nA tower of fire…",
      },
    ],
  },
};

function open(section: (typeof templateSections)[number], extra = {}) {
  return renderRouted(
    <TemplateStudioPage templateId={templateId} section={section} />,
    testDeps({ ...routes, ...extra }),
  );
}

describe("The template studio explains every control", () => {
  it.each(templateSections)("in %s", async (section) => {
    open(section);
    await screen.findByRole("region", { name: /settings$/ });
    expectExplained();
  });

  it("in the sample topic drawer", async () => {
    const user = userEvent.setup();
    open("subject", {
      [`POST /api/template-studio/${templateId}/quote`]: jsonAnswer({
        version: 3,
        first: false,
        sections: [],
        rows: [],
        low: 0,
        high: 0.1,
        unknown: 1,
        onPlan: false,
        budget: { budget: 2, spent: 0, left: 2 },
        fits: true,
        problem: null,
      }),
    });
    await user.click(await screen.findByRole("button", { name: /^Sample topic:/ }));
    await screen.findByRole("dialog", { name: "Sample topic" });
    expectExplained();
  });

  it("in Compare models and beside the compared models", async () => {
    const user = userEvent.setup();
    open("script", {
      [`GET /api/template-studio/${templateId}`]: jsonAnswer(madeSample),
      [`GET /api/template-studio/${templateId}/bakeoff`]: jsonAnswer(bakeoff),
      [`POST /api/template-studio/${templateId}/bakeoff/quote`]: jsonAnswer({
        version: 3,
        section: "script",
        current: { provider: "openrouter", model: "claude" },
        models: [
          {
            provider: "openrouter",
            model: "x",
            high: 0.01,
            unknown: 1,
            onPlan: false,
            problem: null,
          },
        ],
        high: 0.01,
        unknown: 1,
        budget: { budget: 2, spent: 0, left: 2 },
        fits: true,
        problem: null,
      }),
      "GET /api/providers/openrouter/models": jsonAnswer({ models: [{ id: "x", name: "X" }] }),
    });
    await screen.findByRole("region", { name: "Compared models" });
    expectExplained();
    await user.click(await screen.findByRole("button", { name: "Compare models" }));
    await screen.findByRole("dialog", { name: "Compare models" });
    expectExplained();
  });
});
