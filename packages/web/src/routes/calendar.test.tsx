import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type Answer, jsonAnswer, renderRouted, testDeps } from "../test-app";
import { CalendarRoute } from "./calendar";

afterEach(cleanup);
beforeEach(() => {
  try {
    window.localStorage.removeItem("slopify.calendar.view");
  } catch {
    // No storage in this runner: the view starts on weeks anyway.
  }
});

const templateId = "11111111-1111-4111-8111-111111111111";
const scheduleId = "22222222-2222-4222-8222-222222222222";
const otherId = "33333333-3333-4333-8333-333333333333";
const inDays = (days: number, hour: number): string => {
  const date = new Date();
  date.setHours(hour, 0, 0, 0);
  return new Date(date.valueOf() + days * 24 * 60 * 60_000).toISOString();
};
const summary = (
  id: string,
  name: string,
  items: readonly string[],
  over: Record<string, unknown> = {},
) => ({
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
  ...over,
});
const run = (day: number, index: number | null, topic: string | null, schedule = scheduleId) => ({
  at: inDays(day, 9),
  scheduleId: schedule,
  scheduleName: schedule === scheduleId ? "Lore" : "Other",
  scheduleVersion: 4,
  paused: false,
  templateId,
  templateVersion: 1,
  templateName: "Stories",
  index,
  topic,
  topicSource: topic === null ? "generated" : "queued",
});

function deps(
  extra: Readonly<Record<string, Answer>> = {},
  schedules = [
    summary(scheduleId, "Lore", ["Tiamat", "Vecna"]),
    summary(otherId, "Other", ["Orcus"]),
  ],
) {
  return testDeps({
    "GET /api/calendar": jsonAnswer({
      from: inDays(0, 0),
      to: inDays(28, 0),
      runs: [
        run(1, 0, "Tiamat"),
        run(2, 1, "Vecna"),
        run(3, null, null),
        run(2, 0, "Orcus", otherId),
      ],
      projects: [],
      queued: [],
    }),
    "GET /api/schedules": jsonAnswer({ schedules }),
    ...extra,
  });
}

describe("the calendar", () => {
  it("lays the weeks out Monday to Sunday with each run's topic on its day", async () => {
    renderRouted(<CalendarRoute />, deps());
    const chip = await screen.findByRole("article", {
      name: /^Tiamat, .*Lore\. Alt\+arrow keys move it\.$/,
    });
    expect(chip.getAttribute("draggable")).toBe("true");
    expect(screen.getByText("A topic Slopify will suggest")).not.toBeNull();
    const columns = document.querySelectorAll(".sl-cal-week");
    expect(columns).toHaveLength(4);
    expect(columns[0]?.querySelectorAll(".sl-cal-day")).toHaveLength(7);
  });

  it("moves a topic a place with Alt+arrow keys, sending the version it showed", async () => {
    const move = vi.fn(jsonAnswer(summary(scheduleId, "Lore", ["Vecna", "Tiamat"])));
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/move`]: move }),
    );
    const vecna = await screen.findByRole("article", { name: /^Vecna,/ });
    fireEvent.keyDown(vecna, { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(move).toHaveBeenCalledOnce());
    const request = move.mock.calls[0]?.[0] as Request;
    expect(JSON.parse(await request.text())).toEqual({ baseVersion: 4, from: 1, to: 0 });
  });

  it("moves a dragged topic onto another schedule's run at that run's place", async () => {
    const transfer = vi.fn(
      jsonAnswer({
        source: summary(scheduleId, "Lore", ["Vecna"]),
        target: summary(otherId, "Other", ["Tiamat", "Orcus"]),
      }),
    );
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/transfer`]: transfer }),
    );
    const tiamat = await screen.findByRole("article", { name: /^Tiamat,/ });
    const orcus = screen.getByRole("article", { name: /^Orcus,/ });
    fireEvent.dragStart(tiamat, { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.drop(orcus, { dataTransfer: { getData: () => "" } });
    await waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    const request = transfer.mock.calls[0]?.[0] as Request;
    expect(JSON.parse(await request.text())).toEqual({
      baseVersion: 4,
      index: 0,
      targetId: otherId,
      position: 0,
    });
  });

  it("says why a topic can't be dropped on a day with no run", async () => {
    renderRouted(<CalendarRoute />, deps());
    const tiamat = await screen.findByRole("article", { name: /^Tiamat,/ });
    const empty = [...document.querySelectorAll<HTMLElement>(".sl-cal-day")].find(
      (day) => day.querySelectorAll("article").length === 0,
    );
    expect(empty).toBeDefined();
    fireEvent.dragStart(tiamat, { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.drop(empty as HTMLElement, { dataTransfer: { getData: () => "" } });
    expect(
      await screen.findByText(/^No run is planned on .* Drop the topic on a day that has one/),
    ).not.toBeNull();
  });

  it("offers the same moves as buttons in the list view", async () => {
    const user = userEvent.setup();
    const move = vi.fn(jsonAnswer(summary(scheduleId, "Lore", ["Vecna", "Tiamat"])));
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/move`]: move }),
    );
    await screen.findByRole("article", { name: /^Tiamat,/ });
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Move Vecna earlier" }));
    await waitFor(() => expect(move).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("combobox", { name: "Move Tiamat to another schedule" }),
    ).not.toBeNull();
  });

  it("adds typed topics to the end of a schedule's queue", async () => {
    const user = userEvent.setup();
    const put = vi.fn(
      jsonAnswer(summary(scheduleId, "Lore", ["Tiamat", "Vecna", "Lolth", "Bane"])),
    );
    renderRouted(<CalendarRoute />, deps({ [`PUT /api/schedules/${scheduleId}`]: put }));
    await screen.findByRole("article", { name: /^Tiamat,/ });
    await user.click(screen.getByRole("button", { name: "Add to calendar" }));
    const dialog = screen.getByRole("dialog", { name: "Add to calendar" });
    await user.type(within(dialog).getByLabelText("Topics, one per line"), "Lolth\n\n  Bane  ");
    await user.click(within(dialog).getByRole("button", { name: "Add 2 topics" }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    const body = JSON.parse(
      (await (put.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}",
    );
    expect(body.items.map((item: { title: string }) => item.title)).toEqual([
      "Tiamat",
      "Vecna",
      "Lolth",
      "Bane",
    ]);
    expect(body.baseVersion).toBe(4);
  });
});

describe("suggested topics", () => {
  const holding = summary(scheduleId, "Lore", ["Tiamat"], {
    topicGeneration: { mode: "hold", keepAtLeast: 10, llm: null },
    topics: { held: 2, generatingSince: null, generatedAt: null, failedAt: null, error: null },
  });

  it("lists the held topics with Queue and Reject on each, and Queue all", async () => {
    const user = userEvent.setup();
    const approve = vi.fn(jsonAnswer(holding));
    const reject = vi.fn(jsonAnswer(holding));
    const all = vi.fn(jsonAnswer(holding));
    renderRouted(
      <CalendarRoute />,
      deps(
        {
          [`GET /api/schedules/${scheduleId}/topics/held`]: jsonAnswer({
            topics: [
              {
                id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
                title: "Orcus",
                rank: 0,
                createdAt: "x",
              },
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                title: "Asmodeus",
                rank: 1,
                createdAt: "x",
              },
            ],
          }),
          [`POST /api/schedules/${scheduleId}/topics/held/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/approve`]:
            approve,
          [`POST /api/schedules/${scheduleId}/topics/held/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/reject`]:
            reject,
          [`POST /api/schedules/${scheduleId}/topics/held/approve-all`]: all,
        },
        [holding],
      ),
    );
    const panel = await screen.findByRole("region", { name: "Suggested topics for Lore" });
    await user.click(await within(panel).findByRole("button", { name: "Queue Orcus" }));
    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    await user.click(within(panel).getByRole("button", { name: "Reject Asmodeus" }));
    await waitFor(() => expect(reject).toHaveBeenCalledOnce());
    await user.click(within(panel).getByRole("button", { name: "Queue all 2" }));
    await waitFor(() => expect(all).toHaveBeenCalledOnce());
    expect(within(panel).getByText("Keeps at least 10 topics queued.")).not.toBeNull();
  });
});
