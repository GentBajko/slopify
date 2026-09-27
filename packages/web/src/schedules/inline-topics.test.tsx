import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { SchedulesView } from "@/schedules/view";
import { jsonAnswer, problemAnswer, renderRouted, testDeps } from "@/test-app";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const base = {
  id: scheduleId,
  name: "Morning stories",
  templateId,
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: [
    { title: "Pyramids", values: {} },
    { title: "Obelisks", values: { "Min. Word Count": "900" } },
  ],
  topicKeyword: "Topic",
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
} as const;

// A fake server holding one schedule: PUT …/topics replaces its queue when the version
// matches, the way the real route does.
function server() {
  let schedule: Record<string, unknown> = { ...base };
  const sent: { baseVersion: number; items: ScheduleSummary["items"] }[] = [];
  const routes = {
    "GET /api/schedules": (request: Request) => jsonAnswer({ schedules: [schedule] })(request),
    "GET /api/project-templates": jsonAnswer({
      templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: base.updatedAt }],
    }),
    [`GET /api/schedules/${scheduleId}`]: (request: Request) =>
      jsonAnswer({ schedule, runs: [] })(request),
    [`PUT /api/schedules/${scheduleId}/topics`]: async (request: Request) => {
      const body = (await request.json()) as {
        baseVersion: number;
        items: ScheduleSummary["items"];
      };
      sent.push(body);
      if (body.baseVersion !== schedule.version)
        return problemAnswer("This schedule changed while you were editing.", 409)(request);
      schedule = { ...schedule, items: body.items, version: body.baseVersion + 1 };
      return jsonAnswer(schedule)(request);
    },
  };
  return {
    routes,
    sent,
    titles: () => (schedule.items as ScheduleSummary["items"]).map((one) => one.title),
  };
}

function mount(routes: Parameters<typeof testDeps>[0]) {
  renderRouted(
    <ToastProvider>
      <SchedulesView />
    </ToastProvider>,
    testDeps(routes),
  );
}

it("adds, renames, moves and removes a queued topic from the schedule detail, each saved at once", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });

  await user.type(within(queue).getByRole("textbox", { name: "New topic" }), "Hypatia{Enter}");
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramids", "Obelisks", "Hypatia"]));
  expect(fake.sent[0]?.baseVersion).toBe(1);
  // A topic's own values travel with it untouched.
  expect(fake.sent[0]?.items[1]).toEqual({
    title: "Obelisks",
    values: { "Min. Word Count": "900" },
  });
  expect(await screen.findByText("Added “Hypatia”.")).toBeTruthy();
  expect(
    (within(queue).getByRole("textbox", { name: "New topic" }) as HTMLInputElement).value,
  ).toBe("");

  const first = within(queue).getByRole("textbox", { name: "Topic 1" });
  await user.clear(first);
  await user.type(first, "Pyramid tombs{Enter}");
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramid tombs", "Obelisks", "Hypatia"]));
  expect(fake.sent[1]?.baseVersion).toBe(2);

  await user.click(within(queue).getByRole("button", { name: "Move Hypatia up" }));
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramid tombs", "Hypatia", "Obelisks"]));

  await user.click(within(queue).getByRole("button", { name: "Remove Obelisks" }));
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramid tombs", "Hypatia"]));
  expect(fake.sent.map((one) => one.baseVersion)).toEqual([1, 2, 3, 4]);
});

it("undoes a change from its toast", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  await user.click(within(queue).getByRole("button", { name: "Remove Pyramids" }));
  await waitFor(() => expect(fake.titles()).toEqual(["Obelisks"]));
  const toast = await screen.findByText("Removed “Pyramids”.");
  await user.click(
    within(toast.closest("div") as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramids", "Obelisks"]));
  expect(fake.sent[1]?.items[1]).toEqual({
    title: "Obelisks",
    values: { "Min. Word Count": "900" },
  });
});

it("says what failed and what to do when a change is refused, and keeps an empty rename from saving", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount({
    ...fake.routes,
    [`PUT /api/schedules/${scheduleId}/topics`]: problemAnswer(
      "Topic 3 (“Cleopatra”): “Mood” is not a keyword of this template.",
    ),
  });
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  await user.type(within(queue).getByRole("textbox", { name: "New topic" }), "Cleopatra{Enter}");
  expect((await within(queue).findByRole("alert")).textContent).toBe(
    "The topics weren't saved: Topic 3 (“Cleopatra”): “Mood” is not a keyword of this template.",
  );

  const first = within(queue).getByRole("textbox", { name: "Topic 1" });
  await user.clear(first);
  await user.tab();
  expect(within(queue).getByRole("alert").textContent).toBe(
    "Topic 1 needs a {{Topic}}. Write one, or press its Remove button.",
  );
});

it("leaves the queue alone for a schedule that can no longer run", async () => {
  const fake = server();
  mount({
    ...fake.routes,
    "GET /api/schedules": jsonAnswer({ schedules: [{ ...base, status: "completed" }] }),
  });
  await screen.findByRole("region", { name: "Morning stories detail" });
  expect(screen.queryByRole("region", { name: "Queued topics" })).toBeNull();
});
