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
      "Queued 1 sample; 1 wait, as each template's studio says. They are made one at a time in the background.",
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

it("lets samples use CLI plans only once switched on, saying what each state limits", async () => {
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
  const toggle = await screen.findByRole("switch", { name: "Samples may use my CLI plans" });
  expect(toggle.getAttribute("aria-checked")).toBe("false");
  expect(
    screen.getByText(/Off: no sample runs a step on your Claude Code or Codex plan/),
  ).toBeTruthy();
  await user.click(toggle);
  await waitFor(() => expect(put).toHaveBeenCalledOnce());
  expect(sent).toEqual({ dailyBudget: 2, samplesUsePlans: true });
  expect(await screen.findByText(/the budget above doesn't limit it/)).toBeTruthy();
});
