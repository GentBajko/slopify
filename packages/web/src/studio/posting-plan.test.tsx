import type { PostingPlan } from "@app/slices/studio/plan-model.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "@/test-app";
import { PostingPlanSettings } from "./posting-plan.js";

afterEach(cleanup);

it("starts empty, and each long video takes as many shorts as you post", async () => {
  const saved: PostingPlan[] = [];
  renderApp(
    <PostingPlanSettings autoComment={false} />,
    testDeps({
      "GET /api/studio/plan": jsonAnswer({
        plan: { timeZone: "UTC", rows: [] },
        leadHours: 24,
        series: [],
      }),
      "PUT /api/studio/plan": async (request) => {
        const plan = (await request.json()) as PostingPlan;
        saved.push(plan);
        return jsonAnswer({ plan, leadHours: 24, series: [] })(request);
      },
    }),
  );
  expect(await screen.findByText(/No posting plan yet/)).toBeTruthy();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add a long video" }));
  await user.click(screen.getByRole("button", { name: "Short" }));
  await user.click(screen.getByRole("button", { name: "Short" }));
  await user.click(screen.getByRole("button", { name: "Remove short 1 of long video 1" }));
  // No letters: a line is just its long video.
  expect(screen.queryByText("A")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Save posting plan" }));
  await waitFor(() => expect(saved).toHaveLength(1));
  expect(saved[0]?.rows).toEqual([
    { name: "1", series: "", long: { day: 0, time: "20:00" }, shorts: [{ day: 0, time: "20:00" }] },
  ]);
});
