import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { SchedulesView } from "@/schedules/view";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const schedule = (topicScoring: string, items: string[]) => ({
  id: scheduleId,
  name: "Morning stories",
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: items.map((title) => ({ title, values: {} })),
  topicKeyword: "Topic",
  topicGeneration: { mode: "queue", keepAtLeast: 3, llm: null },
  topicScoring,
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
});

function mount(topicScoring: string) {
  let current = schedule(topicScoring, ["Pyramids", "Obelisks"]);
  const rescored: string[] = [];
  const scores = {
    pyramids: {
      score: 82,
      reasons: ["Wikipedia: 777k views last month", "Library: new; nothing like it made or queued"],
    },
  };
  renderRouted(
    <ToastProvider>
      <SchedulesView />
    </ToastProvider>,
    testDeps({
      "GET /api/schedules": (request) => jsonAnswer({ schedules: [current] })(request),
      "GET /api/project-templates": jsonAnswer({
        templates: [
          { id: templateId, name: "Stories", version: 1, updatedAt: "2026-09-12T00:00:00.000Z" },
        ],
      }),
      [`GET /api/schedules/${scheduleId}`]: (request) =>
        jsonAnswer({ schedule: current, runs: [], scores })(request),
      [`GET /api/schedules/${scheduleId}/topics/held`]: jsonAnswer({ topics: [], scores: {} }),
      [`POST /api/schedules/${scheduleId}/topics/score`]: (request) => {
        rescored.push(request.method);
        current = { ...schedule(topicScoring, ["Obelisks", "Pyramids"]), version: 2 };
        return jsonAnswer(current)(request);
      },
    }),
  );
  return { rescored };
}

it("shows each scored topic's score with why, and rescores the queue on request", async () => {
  const user = userEvent.setup();
  const h = mount("search");
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  expect(await within(queue).findByText("Score 82")).toBeTruthy();
  // Only the scored topic carries a chip.
  expect(within(queue).getAllByText(/^Score /)).toHaveLength(1);
  await user.click(within(queue).getByRole("button", { name: "Why “Pyramids” scored 82" }));
  expect(await screen.findByText("Wikipedia: 777k views last month")).toBeTruthy();
  await user.click(within(queue).getByRole("button", { name: "Rescore" }));
  await waitFor(() => expect(h.rescored).toEqual(["POST"]));
  expect(await screen.findByText(/^Topics rescored and put in score order/)).toBeTruthy();
});

it("offers no Rescore while the schedule doesn't rank topics", async () => {
  mount("off");
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  expect(within(queue).queryByRole("button", { name: "Rescore" })).toBeNull();
});
