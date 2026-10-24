import { templateSections } from "@app/slices/template-studio/model.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { selfExplanatory, stageEditors, unexplainedControls } from "@/help/coverage";
import { TemplateStudioPage } from "@/template-studio/page";
import { routes, templateId, view } from "@/template-studio/studio.fake";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

// Templates → Edit template: every control in every section, in the topic and Compare models
// drawers, and beside compared models, is explained beside it, by a visible help line or an
// info button (help/coverage.ts), or says what it does by its name alone (below). The walk
// opens each one the way a person would.
const studioAllow: readonly (string | RegExp)[] = [
  // Names that say what they set: the template's own name, and presets whose options name
  // every choice ("Landscape 16:9", "On the video", "Zoom").
  "Template name",
  "Article",
  "Images",
  "Shape",
  "Captions",
  "Image motion",
  "Seconds per image",
  "Thumbnail",
  "Thumbnails per video",
  "PDF",
  "Soften breaths",
  "Soften S sounds",
  // The service and model pickers under "Made by" when nothing makes the images yet: their
  // red line says why they matter.
  "Service",
  "Model",
  // The sample topic drawer's own topic, under the sentence saying what the topic is for.
  "Your topic",
];

function expectExplained(): void {
  expect(
    unexplainedControls(document.body, [...selfExplanatory, ...stageEditors, ...studioAllow]),
  ).toEqual([]);
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

describe("Edit template explains every control", () => {
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
    await user.click(await screen.findByRole("button", { name: "Change the sample topic" }));
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
