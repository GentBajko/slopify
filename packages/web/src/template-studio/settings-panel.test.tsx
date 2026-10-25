import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "../test-app";
import { TemplateStudioSettings } from "./settings-panel";

afterEach(cleanup);

const settings = jsonAnswer({
  dailyBudget: 2,
  samplesUsePlans: false,
  today: { budget: 2, spent: 0, left: 2, plans: false },
});
const item = (name: string, high: number, fits: boolean) => ({
  templateId: `${name}-id`,
  name,
  version: 1,
  high,
  unknown: 0,
  fits,
  problem: null,
});

it("shows the total first and makes the samples for all at that total", async () => {
  let sent: unknown;
  const make = vi.fn(async (request: Request) => {
    sent = await request.json();
    return jsonAnswer({ queued: ["a"], held: ["b"] })(request);
  });
  const user = userEvent.setup();
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": settings,
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [item("Alpha", 0.4, true), item("Beta", 0.5, false)],
        total: 0.9,
        fitting: 1,
        sentence:
          "2 templates need a sample: about $0.90 in all. 1 of them fits today's budget; the other 1 wait for tomorrow or a higher budget in Settings → Template studio.",
      }),
      "POST /api/template-studio/samples-for-all": make,
    }),
  );
  expect(await screen.findByText(/2 templates need a sample: about \$0\.90 in all\./)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Make samples for all · about $0.90" }));
  await waitFor(() => expect(make).toHaveBeenCalledOnce());
  expect(sent).toEqual({ acknowledgedTotal: 0.9, acknowledgedUnknown: false });
  expect(
    await screen.findByText(
      "Queued 1 sample; 1 wait, as each template's Edit template page says. They are made one at a time in the background.",
    ),
  ).toBeTruthy();
});

it("keeps the button visible but disabled, saying why, when nothing needs a sample", async () => {
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": settings,
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [],
        total: 0,
        fitting: 0,
        sentence: "Every template's sample is made for its newest version. Nothing to make.",
      }),
    }),
  );
  const button = await screen.findByRole("button", { name: "Make samples for all" });
  await waitFor(() => expect(button.getAttribute("aria-disabled")).toBe("true"));
});

it("shows the refusal's own sentence when the total went up", async () => {
  const user = userEvent.setup();
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": settings,
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [item("Alpha", 0.4, true)],
        total: 0.4,
        fitting: 1,
        sentence: "1 template needs a sample: about $0.40 in all.",
      }),
      "POST /api/template-studio/samples-for-all": () =>
        new Response(
          JSON.stringify({
            title: "Conflict",
            detail:
              "Making them now costs about $0.90, more than the $0.40 you saw. Press Make samples for all again to accept the new price.",
            reason: "cost-changed",
          }),
          { status: 409, headers: { "content-type": "application/problem+json" } },
        ),
    }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Make samples for all · about $0.40" }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain("more than the $0.40 you saw");
});

it("lets samples use a Claude Code or Codex plan only once switched on, saying what each state limits", async () => {
  let sent: unknown;
  const put = vi.fn(async (request: Request) => {
    sent = await request.json();
    return jsonAnswer({
      dailyBudget: 2,
      samplesUsePlans: true,
      today: { budget: 2, spent: 0, left: 2, plans: true },
    })(request);
  });
  const user = userEvent.setup();
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": settings,
      "PUT /api/template-studio/settings": put,
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [],
        total: 0,
        fitting: 0,
        sentence: "Every template's sample is made for its newest version. Nothing to make.",
      }),
    }),
  );
  const toggle = await screen.findByRole("switch", {
    name: "Let samples use my Claude Code or Codex plan",
  });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(
    screen.getByText(
      "Off: a sample that needs your plan, poster samples included, waits until you turn this on.",
    ),
  ).toBeTruthy();
  await user.click(toggle);
  await waitFor(() => expect(put).toHaveBeenCalledOnce());
  expect(sent).toEqual({ dailyBudget: 2, samplesUsePlans: true });
  expect(await screen.findByText(/the budgets above don't limit it/)).toBeTruthy();
});

it("says today's sample calls with no known price beside what was spent", async () => {
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": jsonAnswer({
        dailyBudget: 2,
        samplesUsePlans: false,
        today: { budget: 2, spent: 0.5, unpriced: 3, left: 1.5, plans: false },
      }),
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [],
        total: 0,
        fitting: 0,
        sentence: "Every template's sample is made for its newest version. Nothing to make.",
      }),
    }),
  );
  expect(
    await screen.findByText(
      /Spent today: \$0\.50 plus 3 calls with no known price; left: \$1\.50\./,
    ),
  ).toBeTruthy();
});

it("sets the poster templates' daily budget on its own", async () => {
  let sent: unknown;
  const put = vi.fn(async (request: Request) => {
    sent = await request.json();
    return jsonAnswer({
      dailyBudget: 2,
      samplesUsePlans: false,
      designDailyBudget: 3,
      today: { budget: 2, spent: 0, left: 2, plans: false },
      designToday: { budget: 3, spent: 0.25, left: 2.75 },
    })(request);
  });
  const user = userEvent.setup();
  renderRouted(
    <TemplateStudioSettings />,
    testDeps({
      "GET /api/template-studio/settings": jsonAnswer({
        dailyBudget: 2,
        samplesUsePlans: false,
        designDailyBudget: 1,
        today: { budget: 2, spent: 0, left: 2, plans: false },
        designToday: { budget: 1, spent: 0.25, left: 0.75 },
      }),
      "PUT /api/template-studio/settings": put,
      "POST /api/template-studio/samples-for-all/quote": jsonAnswer({
        items: [],
        total: 0,
        fitting: 0,
        sentence: "Every template's sample is made for its newest version. Nothing to make.",
      }),
    }),
  );
  const field = await screen.findByRole("spinbutton", {
    name: "Poster templates: daily budget",
  });
  expect(screen.getByText(/Spent today: \$0\.25; left: \$0\.75\./)).toBeTruthy();
  await user.clear(field);
  await user.type(field, "5000");
  expect(screen.getByText("Enter an amount between $0.00 and $1,000.00.")).toBeTruthy();
  await user.clear(field);
  await user.type(field, "3");
  await user.click(screen.getByRole("button", { name: "Save poster budget" }));
  await waitFor(() => expect(put).toHaveBeenCalledOnce());
  expect(sent).toEqual({ designDailyBudget: 3 });
  expect(await screen.findByText(/Spent today: \$0\.25; left: \$2\.75\./)).toBeTruthy();
});
