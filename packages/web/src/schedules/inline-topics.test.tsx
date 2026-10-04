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
  const moves: { baseVersion: number; from: number; to: number }[] = [];
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
    [`POST /api/schedules/${scheduleId}/topics/move`]: async (request: Request) => {
      const body = (await request.json()) as { baseVersion: number; from: number; to: number };
      moves.push(body);
      if (body.baseVersion !== schedule.version)
        return problemAnswer("This schedule changed while you were editing.", 409)(request);
      const items = [...(schedule.items as ScheduleSummary["items"])];
      const [row] = items.splice(body.from, 1);
      if (row !== undefined) items.splice(body.to, 0, row);
      schedule = { ...schedule, items, version: body.baseVersion + 1 };
      return jsonAnswer(schedule)(request);
    },
  };
  return {
    routes,
    sent,
    moves,
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
  expect(fake.moves).toEqual([{ baseVersion: 3, from: 2, to: 1 }]);

  await user.click(within(queue).getByRole("button", { name: "Remove Obelisks" }));
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramid tombs", "Hypatia"]));
  expect(fake.sent.map((one) => one.baseVersion)).toEqual([1, 2, 4]);
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

it("adds one topic per pasted line in one save, and Undo takes them all back", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  await user.click(within(queue).getByRole("textbox", { name: "New topic" }));
  await user.paste("- Hypatia\n\n- Nefertiti\nSphinx");
  await waitFor(() =>
    expect(fake.titles()).toEqual(["Pyramids", "Obelisks", "Hypatia", "Nefertiti", "Sphinx"]),
  );
  expect(fake.sent).toHaveLength(1);
  const toast = await screen.findByText("Added 3 topics.");
  await user.click(
    within(toast.closest("div") as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramids", "Obelisks"]));
});

it("removes the ticked topics together, says how many, and Undo restores them", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  await user.click(within(queue).getByRole("checkbox", { name: "Select row: Pyramids" }));
  await user.click(within(queue).getByRole("checkbox", { name: "Select row: Obelisks" }));
  expect(within(queue).getByText("2 of 2 topics selected")).toBeTruthy();
  await user.click(within(queue).getByRole("button", { name: "Remove selected" }));
  await waitFor(() => expect(fake.titles()).toEqual([]));
  const toast = await screen.findByText("Removed 2 topics.");
  expect(toast.closest("[aria-live=polite]")).toBeTruthy();
  await user.click(
    within(toast.closest("div") as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(fake.titles()).toEqual(["Pyramids", "Obelisks"]));
});

it("moves a topic with Alt+Arrow keys and the focus goes with it", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  within(queue).getByRole("textbox", { name: "Topic 1" }).focus();
  await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
  await waitFor(() => expect(fake.titles()).toEqual(["Obelisks", "Pyramids"]));
  expect(fake.moves).toEqual([{ baseVersion: 1, from: 0, to: 1 }]);
  await waitFor(() =>
    expect((document.activeElement as HTMLInputElement | null)?.value).toBe("Pyramids"),
  );
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Topic 2");
});

it("moves to the top, inserts below and duplicates from a row's More menu", async () => {
  const user = userEvent.setup();
  const fake = server();
  mount(fake.routes);
  const queue = await screen.findByRole("region", { name: "Queued topics" });
  await user.click(within(queue).getByRole("button", { name: "More for Obelisks" }));
  await user.click(await screen.findByRole("menuitem", { name: "Move to top" }));
  await waitFor(() => expect(fake.titles()).toEqual(["Obelisks", "Pyramids"]));
  expect(fake.moves).toEqual([{ baseVersion: 1, from: 1, to: 0 }]);

  await user.click(within(queue).getByRole("button", { name: "More for Obelisks" }));
  await user.click(await screen.findByRole("menuitem", { name: "Insert below" }));
  const insert = await within(queue).findByRole("textbox", { name: "New topic below 1" });
  expect(document.activeElement).toBe(insert);
  await user.type(insert, "Hypatia{Enter}");
  await waitFor(() => expect(fake.titles()).toEqual(["Obelisks", "Hypatia", "Pyramids"]));

  await user.click(within(queue).getByRole("button", { name: "More for Pyramids" }));
  await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
  await waitFor(() =>
    expect(fake.titles()).toEqual(["Obelisks", "Hypatia", "Pyramids", "Pyramids"]),
  );
});
