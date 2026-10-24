import type { DesignStep, DesignView } from "@app/slices/designs/model.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { CostEstimate } from "@app/slices/estimate/index.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import type { TemplateView } from "@/designs/api";
import { DesignRoute } from "@/designs/design-page";
import { blankDocument, blankTemplate } from "@/designs/document";
import { DesignTemplateRoute } from "@/designs/editor/template-editor";
import { selfExplanatory, unexplainedControls } from "@/help/coverage";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

// Library → Designs: every control on a design's page and in the design template editor is
// explained beside it, by a visible help line or an info button (help/coverage.ts). The walk
// opens each tab and section the way a person would. The same check finds jargon in a label,
// an info button beside a button, a heading or a row (or a field's second one), and a second
// lime button in one area.
function expectExplained(): void {
  expect(unexplainedControls(document.body, [...selfExplanatory])).toEqual([]);
}

const at = "2026-10-18T10:00:00.000Z";
const step = (n: number): DesignStep => ({
  id: `s${String(n)}`,
  designId: "d1",
  n,
  parentId: n === 1 ? null : `s${String(n - 1)}`,
  kind: n === 1 ? "upload" : "edit",
  instruction: n === 1 ? null : "Warmer light",
  provider: n === 1 ? null : "fal",
  model: n === 1 ? null : "fal-ai/flux-2",
  inputs: { castMemberIds: [] },
  state: "ready",
  error: null,
  sha256: "a".repeat(64),
  width: 1080,
  height: 1080,
  createdAt: at,
  settledAt: at,
});

function design(patch: Partial<DesignView> = {}): DesignView {
  return {
    id: "d1",
    kind: "edit",
    name: "Band photo",
    channelId: "c1",
    projectId: null,
    templateId: null,
    templateVersion: null,
    scheduleId: null,
    scheduleRunId: null,
    document: null,
    values: {},
    headStepId: "s2",
    sampleOf: null,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
    steps: [step(1), step(2)],
    ...patch,
  };
}

const quote = (high: number, extra: Record<string, unknown> = {}): CostEstimate => ({
  currency: "USD",
  rows: [],
  low: high,
  high,
  unknown: 0,
  expectedWords: 0,
  catalogueDate: null,
  assumptions: [],
  ...extra,
});

const providers: Readonly<Record<string, Answer>> = {
  "GET /api/providers": jsonAnswer({
    providers: [
      {
        id: "fal",
        family: "image",
        displayName: "fal.ai",
        readiness: { kind: "keyed", hasKey: true },
      },
    ],
  }),
  "GET /api/providers/fal/models": jsonAnswer({
    models: [{ id: "fal-ai/flux-2", name: "FLUX.2" }],
    allowsCustom: false,
  }),
  "GET /api/projects": jsonAnswer({ projects: [] }),
  "GET /api/fonts": jsonAnswer({ fonts: [] }),
};

function designDeps(view: DesignView) {
  return testDeps({
    "GET /api/designs/d1": jsonAnswer(view),
    "POST /api/designs/d1/quote": jsonAnswer(quote(0.04)),
    "POST /api/designs/d1/artwork/quote": jsonAnswer(quote(0.04)),
    ...providers,
  });
}

function template(doc: DesignDocument): TemplateView {
  return {
    id: "t1",
    channelId: "c1",
    headVersion: 2,
    name: "Gig poster",
    document: doc,
    gate: "unchecked",
    checks: [],
    readyVersion: 2,
    versions: [],
    createdAt: at,
    updatedAt: at,
    sample: null,
  };
}

const designSchedule = {
  id: "44444444-4444-4444-8444-444444444444",
  name: "Gig poster",
  templateKind: "design",
  templateId: "t1",
  templateVersion: 2,
  cadence: { kind: "by-date", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: [{ title: "Late Set", values: { Event: "Late Set", Date: "2026-11-14" } }],
  topicKeyword: null,
  values: {},
  brief: null,
  topicGeneration: { mode: "off", keepAtLeast: 10, llm: null },
  topics: { held: 0, generatingSince: null, generatedAt: null, failedAt: null, error: null },
  status: "active",
  version: 1,
  nextRunAt: "2026-11-07T09:00:00.000Z",
  createdAt: at,
  updatedAt: at,
  deletedAt: null,
};

function templateDeps(view: TemplateView) {
  return testDeps({
    "GET /api/design-templates/t1": jsonAnswer(view),
    "POST /api/design-templates/t1/quote": jsonAnswer(
      quote(0.04, { sections: ["picture"], makesPicture: true }),
    ),
    "GET /api/schedules": jsonAnswer({ schedules: [designSchedule] }),
    ...providers,
  });
}

describe("Library → Designs explains every control", () => {
  it("on a picture edit's page", async () => {
    renderRouted(<DesignRoute designId="d1" />, designDeps(design()));
    await screen.findByRole("img", { name: "Version 2 of Band photo" });
    await screen.findByRole("button", { name: /^Edit · / });
    expectExplained();
  });

  it("on a designed piece's Edit, Text and Formats tabs", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignRoute designId="d1" />,
      designDeps(design({ kind: "design", document: blankDocument("picture") })),
    );
    await screen.findByRole("img", { name: /^Band photo as drawn, / });
    expectExplained();
    for (const tab of ["Text", "Formats"]) {
      await user.click(screen.getByRole("tab", { name: tab }));
      expectExplained();
    }
  });

  it("in each section of the design template editor", async () => {
    const user = userEvent.setup();
    const doc: DesignDocument = {
      ...blankTemplate(),
      schedule: { dateField: "Date", daysBefore: 7, time: "09:00" },
    };
    renderRouted(<DesignTemplateRoute templateId="t1" />, templateDeps(template(doc)));
    for (const section of ["Picture", "Text layout", "Formats", "Schedule"]) {
      await user.click(await screen.findByRole("button", { name: new RegExp(`^${section}( |$)`) }));
      await screen.findByRole("region", { name: section });
      // The schedule's rows and spend ceiling show once the schedule has loaded.
      if (section === "Schedule") await screen.findByRole("button", { name: "Save schedule" });
      expectExplained();
    }
  });

  it("in the Make a piece drawer, with an unknown price to accept", async () => {
    const user = userEvent.setup();
    renderRouted(
      <DesignTemplateRoute templateId="t1" />,
      testDeps({
        "GET /api/design-templates/t1": jsonAnswer(template(blankTemplate())),
        "POST /api/design-templates/t1/quote": jsonAnswer(
          quote(0, { unknown: 1, sections: [], makesPicture: true }),
        ),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
        ...providers,
      }),
    );
    await user.click(await screen.findByRole("button", { name: "Make a piece" }));
    await screen.findByRole("dialog", { name: "Make a piece" });
    await screen.findByRole("switch", { name: /I accept/ });
    expectExplained();
  });
});
