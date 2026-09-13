import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "../test-app";
import { SchedulesRoute } from "./schedules";

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const summary = {
  id: scheduleId,
  name: "Morning stories",
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: [],
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
};

it("shows schedules and sends a pause action with the current version", async () => {
  let pauseRequest: Request | undefined;
  const pause = vi.fn((request: Request) => {
    pauseRequest = request;
    return jsonAnswer({ ...summary, status: "paused", version: 2 })(request);
  });
  const user = userEvent.setup();
  renderApp(
    <SchedulesRoute />,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({
        templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: summary.updatedAt }],
      }),
      "POST /api/schedules/22222222-2222-4222-8222-222222222222/pause": pause,
    }),
  );
  await screen.findByText("Morning stories");
  expect(screen.getByText(/Daily at 09:00/)).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Pause" }));
  await waitFor(() => expect(pause).toHaveBeenCalledOnce());
  if (pauseRequest === undefined) throw new Error("pause request was not captured");
  expect(pauseRequest.method).toBe("POST");
  expect(JSON.parse(await pauseRequest.text())).toEqual({ baseVersion: 1 });
});
