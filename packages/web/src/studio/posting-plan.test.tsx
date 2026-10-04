import type { PostingPlan } from "@app/slices/studio/plan-model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";
import { PostingPlanSettings } from "./posting-plan.js";

afterEach(cleanup);

it("points to the schedules for release times, and removes an older posting plan", async () => {
  const saved: PostingPlan[] = [];
  const old: PostingPlan = {
    timeZone: "UTC",
    rows: [{ name: "1", series: "", long: { day: 0, time: "20:00" }, shorts: [] }],
  };
  renderRouted(
    <PostingPlanSettings autoComment={false} />,
    testDeps({
      "GET /api/studio/plan": jsonAnswer({ plan: old, leadHours: 24, series: [] }),
      "PUT /api/studio/plan": async (request) => {
        const plan = (await request.json()) as PostingPlan;
        saved.push(plan);
        return jsonAnswer({ plan, leadHours: 24, series: [] })(request);
      },
    }),
  );
  expect(await screen.findByRole("link", { name: "Calendar → Schedules" })).toBeTruthy();
  expect(await screen.findByText("An older posting plan still applies")).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Remove the old plan" }));
  await waitFor(() => expect(saved).toEqual([{ timeZone: "UTC", rows: [] }]));
  await waitFor(() => expect(screen.queryByText("An older posting plan still applies")).toBeNull());
});

it("says the release settings didn't load and retries in place", async () => {
  let fail = true;
  renderRouted(
    <PostingPlanSettings autoComment={false} />,
    testDeps({
      "GET /api/studio/plan": (request) =>
        fail
          ? problemAnswer("The database is busy.", 503)(request)
          : jsonAnswer({ plan: { timeZone: "UTC", rows: [] }, leadHours: 24, series: [] })(request),
    }),
  );
  expect((await screen.findByRole("alert")).textContent).toContain(
    "The release settings didn't load",
  );
  fail = false;
  await userEvent.setup().click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("spinbutton", { name: "Hours before release" })).toBeTruthy();
});
