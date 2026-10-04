import { cleanup, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { SchedulesView } from "./view";

afterEach(cleanup);

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const ids = [
  "55555555-5555-4555-8555-555555555551",
  "55555555-5555-4555-8555-555555555552",
  "55555555-5555-4555-8555-555555555553",
] as const;
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
  topicKeyword: "Topic",
  topicGeneration: { mode: "hold", keepAtLeast: 3, llm: null },
  topics: {
    held: 3,
    generatingSince: null,
    generatedAt: "2026-09-12T07:30:00.000Z",
    failedAt: null,
    error: null,
  },
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
};
const topics = ["Pyramids", "Obelisks", "Sphinxes"].map((title, rank) => ({
  id: ids[rank],
  title,
  values: rank === 1 ? { Tone: "grim" } : {},
  rank,
  createdAt: summary.createdAt,
}));

function mount(extra: Parameters<typeof testDeps>[0]) {
  renderRouted(
    <ToastProvider>
      <SchedulesView />
    </ToastProvider>,
    testDeps({
      "GET /api/schedules": jsonAnswer({ schedules: [summary] }),
      "GET /api/project-templates": jsonAnswer({ templates: [] }),
      [`GET /api/schedules/${scheduleId}/topics/held`]: jsonAnswer({ topics }),
      ...extra,
    }),
  );
}

const bodyOf = async (mock: ReturnType<typeof vi.fn>): Promise<unknown> => {
  const request = mock.mock.calls[0]?.[0];
  if (!(request instanceof Request)) throw new Error("no request");
  return request.clone().json();
};

it("rejects the ticked topics, says so, and Undo puts them back with their keywords", async () => {
  const user = userEvent.setup();
  const reject = vi.fn(jsonAnswer({ ...summary, version: 2 }));
  const restore = vi.fn(jsonAnswer({ ...summary, version: 3 }));
  mount({
    [`POST /api/schedules/${scheduleId}/topics/held/reject`]: reject,
    [`POST /api/schedules/${scheduleId}/topics/held/restore`]: restore,
  });
  // The last generation's time names its zone.
  expect(await screen.findByText(/Topics last generated .*07:30.*UTC/)).toBeTruthy();
  const waiting = await screen.findByRole("list", { name: "Topics waiting" });
  await user.click(within(waiting).getByRole("checkbox", { name: "Select row: Pyramids" }));
  await user.click(within(waiting).getByRole("checkbox", { name: "Select row: Obelisks" }));
  expect(screen.getByText("2 of 3 topics waiting selected")).toBeTruthy();
  await user.click(screen.getByRole("button", { name: "Reject selected" }));
  await waitFor(() => expect(reject).toHaveBeenCalledOnce());
  expect(await bodyOf(reject)).toEqual({ ids: [ids[0], ids[1]] });
  const toast = await screen.findByText(/^Turned down 2 topics\./);
  await user.click(
    within(toast.closest("div") as HTMLElement).getByRole("button", { name: "Undo" }),
  );
  await waitFor(() => expect(restore).toHaveBeenCalledOnce());
  expect(await bodyOf(restore)).toEqual({
    topics: [
      { id: ids[0], values: {} },
      { id: ids[1], values: { Tone: "grim" } },
    ],
  });
});

it("asks before Reject all, naming how many and which schedule", async () => {
  const user = userEvent.setup();
  const reject = vi.fn(jsonAnswer({ ...summary, version: 2 }));
  const approve = vi.fn(jsonAnswer({ ...summary, version: 2 }));
  mount({
    [`POST /api/schedules/${scheduleId}/topics/held/reject`]: reject,
    [`POST /api/schedules/${scheduleId}/topics/held/approve`]: approve,
  });
  await screen.findByRole("list", { name: "Topics waiting" });
  await user.click(screen.getByRole("button", { name: "Reject all" }));
  const dialog = await screen.findByRole("dialog", { name: "Reject all 3 waiting topics?" });
  expect(within(dialog).getByText(/waiting for Morning stories now/)).toBeTruthy();
  await user.click(within(dialog).getByRole("button", { name: "Keep them waiting" }));
  expect(reject).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Reject all" }));
  await user.click(await screen.findByRole("button", { name: "Reject 3 topics" }));
  await waitFor(() => expect(reject).toHaveBeenCalledOnce());
  expect(await bodyOf(reject)).toEqual({ ids: [...ids] });

  const waiting = screen.getByRole("list", { name: "Topics waiting" });
  await user.click(within(waiting).getByRole("checkbox", { name: "Select row: Sphinxes" }));
  await user.click(within(waiting).getByRole("checkbox", { name: "Select row: Pyramids" }));
  await user.click(screen.getByRole("button", { name: "Approve selected" }));
  await waitFor(() => expect(approve).toHaveBeenCalledOnce());
  expect(await bodyOf(approve)).toEqual({ ids: [ids[0], ids[2]] });
});

it("focuses the title when editing, saves with Enter and cancels with Esc", async () => {
  const user = userEvent.setup();
  const edit = vi.fn(jsonAnswer({ ...topics[0], title: "Great Pyramids" }));
  mount({ [`PUT /api/schedules/${scheduleId}/topics/held/${ids[0]}`]: edit });
  const waiting = await screen.findByRole("list", { name: "Topics waiting" });
  const [first] = within(waiting).getAllByRole("button", { name: "Edit" });
  if (first === undefined) throw new Error("no Edit");
  await user.click(first);
  const title = within(waiting).getByRole("textbox", { name: "Edit Pyramids" });
  expect(document.activeElement).toBe(title);
  await user.keyboard("{Escape}");
  expect(within(waiting).queryByRole("textbox", { name: "Edit Pyramids" })).toBeNull();
  expect(edit).not.toHaveBeenCalled();

  await user.click(within(waiting).getAllByRole("button", { name: "Edit" })[0] as HTMLElement);
  await user.type(
    within(waiting).getByRole("textbox", { name: "Edit Pyramids" }),
    "{Home}Great {Enter}",
  );
  await waitFor(() => expect(edit).toHaveBeenCalledOnce());
  expect(await bodyOf(edit)).toEqual({ title: "Great Pyramids", values: {} });
});
