import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { usingModel } from "./bakeoff";
import { TemplateStudioPage } from "./page";
import { document, routes, templateId, view } from "./studio.fake";

afterEach(cleanup);

const made = {
  ...view,
  sections: view.sections.map((section) => ({ ...section, state: "current" as const })),
};

const quote = (high: number, extra: Record<string, unknown> = {}) => ({
  version: 3,
  section: "script",
  current: { provider: "openrouter", model: "claude" },
  models: [
    { provider: "openrouter", model: "x/new", high, unknown: 0, onPlan: false, problem: null },
  ],
  high,
  unknown: 0,
  budget: { budget: 2, spent: 0.5, left: 1.5 },
  fits: true,
  problem: null,
  ...extra,
});

const entry = (over: Record<string, unknown>) => ({
  provider: "openrouter",
  model: "claude",
  slot: null,
  state: "current",
  quotedHigh: null,
  cost: 0.02,
  seconds: 41,
  failure: null,
  outputs: [],
  article: "# Chapter 1\nThe first lighthouse",
  ...over,
});

const results = {
  bakeoff: {
    id: "b1",
    section: "script",
    version: 3,
    stale: false,
    state: "done",
    sentence: null,
    entries: [
      entry({}),
      entry({
        model: "x/new",
        slot: 0,
        state: "done",
        quotedHigh: 0.01,
        cost: 0.008,
        seconds: 12,
        article: "# Chapter 1\nA tower of fire",
      }),
    ],
  },
};

function open(extra = {}, compare?: { provider: string; model: string }) {
  return renderRouted(
    <TemplateStudioPage templateId={templateId} section="script" compare={compare} />,
    testDeps({
      ...routes,
      [`GET /api/template-studio/${templateId}`]: jsonAnswer(made),
      "GET /api/providers/openrouter/models": jsonAnswer({
        models: [
          { id: "claude", name: "Claude" },
          { id: "x/new", name: "New One" },
        ],
      }),
      ...extra,
    }),
  );
}

describe("Compare models", () => {
  it("opens ready for a model Settings → Models offered, priced, and starts at the price shown", async () => {
    const user = userEvent.setup();
    const started = vi.fn(async (request: Request) => {
      expect(await request.json()).toEqual({
        section: "script",
        models: [{ provider: "openrouter", model: "x/new" }],
        acknowledgedHigh: 0.0125,
        acknowledgedUnknown: false,
      });
      return Response.json({ id: "b1", version: 3 }, { status: 202 });
    });
    open(
      {
        [`POST /api/template-studio/${templateId}/bakeoff/quote`]: jsonAnswer(quote(0.0125)),
        [`POST /api/template-studio/${templateId}/bakeoff`]: started,
      },
      { provider: "openrouter", model: "x/new" },
    );
    const dialog = await screen.findByRole("dialog", { name: "Compare models" });
    expect(within(dialog).getByText(/In use now: claude/)).not.toBeNull();
    const go = await within(dialog).findByRole("button", { name: "Compare · about $0.01" });
    expect(
      within(dialog).getByText(
        /x\/new: about \$0.01 · \$1.50 of today's \$2.00 sample budget left/,
      ),
    ).not.toBeNull();
    await user.click(go);
    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
  });

  it("can't start past today's budget, and says why on the button", async () => {
    open(
      {
        [`POST /api/template-studio/${templateId}/bakeoff/quote`]: jsonAnswer(
          quote(3, { fits: false, budget: { budget: 2, spent: 0, left: 2 } }),
        ),
      },
      { provider: "openrouter", model: "x/new" },
    );
    const dialog = await screen.findByRole("dialog", { name: "Compare models" });
    const go = await within(dialog).findByRole("button", { name: "Compare · about $3.00" });
    expect(go.getAttribute("aria-disabled") ?? go.getAttribute("disabled")).not.toBeNull();
    expect(
      within(dialog).getByText(
        /Comparing costs about \$3\.00 and \$2\.00 of today's \$2\.00 sample budget is left/,
      ),
    ).not.toBeNull();
    expect(within(dialog).getByRole("link", { name: "Settings → Template studio" })).not.toBeNull();
  });

  it("asks for a Save first, in words, while the settings have unsaved changes", async () => {
    const user = userEvent.setup();
    open();
    await user.clear(await screen.findByLabelText("Expected length (words)"));
    await user.type(screen.getByLabelText("Expected length (words)"), "900");
    expect(screen.queryByRole("button", { name: "Compare models" })).toBeNull();
    expect(
      screen.getByText(
        "Save to compare other models: they are compared on the saved version's sample.",
      ),
    ).not.toBeNull();
  });
});

describe("Compared models", () => {
  it("shows each model's cost and time, and Use this model discards the copies and switches the model", async () => {
    const user = userEvent.setup();
    const discarded = vi.fn(() => Response.json({ removed: 1 }));
    open({
      [`GET /api/template-studio/${templateId}/bakeoff`]: jsonAnswer(results),
      [`DELETE /api/template-studio/${templateId}/bakeoff`]: discarded,
    });
    const list = await screen.findByRole("list", { name: "Models compared" });
    const lines = within(list)
      .getAllByRole("listitem")
      .map((row) => row.querySelector("p + p")?.textContent);
    expect(lines).toContain("Made· $0.008 charged · 12 s");
    expect(lines).toContain("In use now· $0.02 charged · 41 s");
    await user.click(within(list).getByRole("button", { name: "Use this model" }));
    await waitFor(() => expect(discarded).toHaveBeenCalledTimes(1));
    expect(
      await screen.findByText(
        /Switched to x\/new; the compared copies were discarded\. Press Save, then Make sample/,
      ),
    ).not.toBeNull();
  });

  it("says why a bake-off waits, and Discard is refused while one is being made", async () => {
    open({
      [`GET /api/template-studio/${templateId}/bakeoff`]: jsonAnswer({
        bakeoff: {
          ...results.bakeoff,
          state: "making",
          entries: [
            results.bakeoff.entries[0],
            { ...results.bakeoff.entries[1], state: "making", cost: null, seconds: null },
          ],
        },
      }),
    });
    const region = await screen.findByRole("region", { name: "Compared models" });
    const discard = within(region).getByRole("button", { name: "Discard" });
    expect(
      discard.getAttribute("aria-disabled") ?? discard.getAttribute("disabled"),
    ).not.toBeNull();
    expect(region.textContent).toContain("Making· about $0.01 · time not known");
    cleanup();
    open({
      [`GET /api/template-studio/${templateId}/bakeoff`]: jsonAnswer({
        bakeoff: {
          ...results.bakeoff,
          state: "held",
          sentence:
            "Waiting: comparing costs about $0.40 and $0.10 of today's $2.00 sample budget is left.",
          entries: [results.bakeoff.entries[0]],
        },
      }),
    });
    expect(await screen.findByText(/^Waiting: comparing costs about \$0.40/)).not.toBeNull();
  });
});

describe("usingModel", () => {
  it("switches only the section's model, keeping the thinking level on the same provider", () => {
    const thinking = {
      ...document,
      form: {
        ...document.form,
        llm: { provider: "openrouter", model: "claude", thinking: "high" as const },
      },
    };
    expect(usingModel(thinking, "script", { provider: "openrouter", model: "x" }).form.llm).toEqual(
      {
        provider: "openrouter",
        model: "x",
        thinking: "high",
      },
    );
    expect(usingModel(thinking, "script", { provider: "openai", model: "y" }).form.llm).toEqual({
      provider: "openai",
      model: "y",
    });
    expect(usingModel(document, "voice", { provider: "x", model: "v2" }).form.audio).toEqual({
      ...document.form.audio,
      model: "v2",
    });
  });
});
