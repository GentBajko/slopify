import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { jsonAnswer, renderApp, testDeps } from "../test-app";
import { CalendarRoute } from "./calendar";

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const inDays = (days: number, hour: number): string => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Date(date.valueOf() + days * 24 * 60 * 60_000).toISOString();
};
const summary = (id: string, name: string, items: readonly string[]) => ({
  id,
  name,
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: items.map((title) => ({ title, values: {} })),
  status: "active",
  version: 4,
  nextRunAt: inDays(1, 9),
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
});
const run = (day: number, index: number | null, topic: string | null) => ({
  at: inDays(day, 9),
  scheduleId,
  scheduleName: "Lore",
  scheduleVersion: 4,
  paused: false,
  templateId,
  templateVersion: 1,
  templateName: "Stories",
  index,
  topic,
  topicSource: topic === null ? "generated" : "queued",
});

it("lists coming runs by day and moves a topic earlier with the version it showed", async () => {
  const move = vi.fn(jsonAnswer(summary(scheduleId, "Lore", ["Vecna", "Tiamat"])));
  const user = userEvent.setup();
  renderApp(
    <CalendarRoute />,
    testDeps({
      "GET /api/calendar": jsonAnswer({
        from: inDays(0, 0),
        to: inDays(28, 0),
        runs: [run(1, 0, "Tiamat"), run(2, 1, "Vecna"), run(3, null, null)],
        projects: [],
        queued: [],
      }),
      "GET /api/schedules": jsonAnswer({
        schedules: [
          summary(scheduleId, "Lore", ["Tiamat", "Vecna"]),
          summary(otherId, "Other", []),
        ],
      }),
      "POST /api/schedules/22222222-2222-4222-8222-222222222222/topics/move": move,
    }),
  );
  await screen.findByText("Vecna");
  expect(screen.getByText("A topic still to be generated")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Move Tiamat earlier" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  expect(
    (screen.getByRole("button", { name: "Move Vecna later" }) as HTMLButtonElement).disabled,
  ).toBe(true);
  await user.click(screen.getByRole("button", { name: "Move Vecna earlier" }));
  await waitFor(() => expect(move).toHaveBeenCalledOnce());
  const request = move.mock.calls[0]?.[0] as Request;
  expect(JSON.parse(await request.text())).toEqual({ baseVersion: 4, from: 1, to: 0 });
});
