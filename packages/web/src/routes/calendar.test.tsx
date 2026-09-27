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
    summary(scheduleId, "Lore", ["Cleopatra", "Hypatia"]),
    summary(otherId, "Other", ["Imhotep"]),
  ],
) {
  return testDeps({
    "GET /api/calendar": jsonAnswer({
      from: inDays(0, 0),
      to: inDays(28, 0),
      runs: [
        run(1, 0, "Cleopatra"),
        run(2, 1, "Hypatia"),
        run(3, null, null),
        run(2, 0, "Imhotep", otherId),
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
      name: /^Cleopatra, .*Lore\. Alt\+arrow keys move it\.$/,
    });
    expect(chip.getAttribute("draggable")).toBe("true");
    expect(screen.getByText("A topic Slopify will suggest")).not.toBeNull();
    const columns = document.querySelectorAll(".sl-cal-week");
    expect(columns).toHaveLength(4);
    expect(columns[0]?.querySelectorAll(".sl-cal-day")).toHaveLength(7);
  });

  it("moves a topic a place with Alt+arrow keys, sending the version it showed", async () => {
    const move = vi.fn(jsonAnswer(summary(scheduleId, "Lore", ["Hypatia", "Cleopatra"])));
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/move`]: move }),
    );
    const hypatia = await screen.findByRole("article", { name: /^Hypatia,/ });
    fireEvent.keyDown(hypatia, { key: "ArrowLeft", altKey: true });
    await waitFor(() => expect(move).toHaveBeenCalledOnce());
    const request = move.mock.calls[0]?.[0] as Request;
    expect(JSON.parse(await request.text())).toEqual({ baseVersion: 4, from: 1, to: 0 });
  });

  it("moves a dragged topic onto another schedule's run at that run's place", async () => {
    const transfer = vi.fn(
      jsonAnswer({
        source: summary(scheduleId, "Lore", ["Hypatia"]),
        target: summary(otherId, "Other", ["Cleopatra", "Imhotep"]),
      }),
    );
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/transfer`]: transfer }),
    );
    const cleopatra = await screen.findByRole("article", { name: /^Cleopatra,/ });
    const imhotep = screen.getByRole("article", { name: /^Imhotep,/ });
    fireEvent.dragStart(cleopatra, { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.drop(imhotep, { dataTransfer: { getData: () => "" } });
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
    const cleopatra = await screen.findByRole("article", { name: /^Cleopatra,/ });
    const empty = [...document.querySelectorAll<HTMLElement>(".sl-cal-day")].find(
      (day) => day.querySelectorAll("article").length === 0,
    );
    expect(empty).toBeDefined();
    fireEvent.dragStart(cleopatra, { dataTransfer: { setData: () => {}, effectAllowed: "" } });
    fireEvent.drop(empty as HTMLElement, { dataTransfer: { getData: () => "" } });
    expect(
      await screen.findByText(/^No run is planned on .* Drop the topic on a day that has one/),
    ).not.toBeNull();
  });

  it("offers the same moves as buttons in the list view", async () => {
    const user = userEvent.setup();
    const move = vi.fn(jsonAnswer(summary(scheduleId, "Lore", ["Hypatia", "Cleopatra"])));
    renderRouted(
      <CalendarRoute />,
      deps({ [`POST /api/schedules/${scheduleId}/topics/move`]: move }),
    );
    await screen.findByRole("article", { name: /^Cleopatra,/ });
    await user.click(screen.getByRole("button", { name: "List" }));
    await user.click(screen.getByRole("button", { name: "Move Hypatia earlier" }));
    await waitFor(() => expect(move).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("combobox", { name: "Move Cleopatra to another schedule" }),
    ).not.toBeNull();
  });

  it("adds typed topics to the end of a schedule's queue", async () => {
    const user = userEvent.setup();
    const put = vi.fn(
      jsonAnswer(summary(scheduleId, "Lore", ["Cleopatra", "Hypatia", "Nefertiti", "Solon"])),
    );
    renderRouted(<CalendarRoute />, deps({ [`PUT /api/schedules/${scheduleId}`]: put }));
    await screen.findByRole("article", { name: /^Cleopatra,/ });
    await user.click(screen.getByRole("button", { name: "Add to calendar" }));
    const dialog = screen.getByRole("dialog", { name: "Add to calendar" });
    await user.type(
      within(dialog).getByLabelText("Topics, one per line"),
      "Nefertiti\n\n  Solon  ",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add 2 topics" }));
    await waitFor(() => expect(put).toHaveBeenCalledOnce());
    const body = JSON.parse(
      (await (put.mock.calls[0]?.[0] as Request | undefined)?.text()) ?? "{}",
    );
    expect(body.items.map((item: { title: string }) => item.title)).toEqual([
      "Cleopatra",
      "Hypatia",
      "Nefertiti",
      "Solon",
    ]);
    expect(body.baseVersion).toBe(4);
  });
});

describe("what needs you and what is ready", () => {
  const project = (id: string, title: string, over: Record<string, unknown>) => ({
    id,
    title,
    state: "done",
    createdAt: inDays(0, 1),
    finishedAt: inDays(0, 2),
    scheduleId: null,
    ...over,
  });

  it("lists the projects waiting for the person and the ones ready to upload, each with its action", async () => {
    renderRouted(
      <CalendarRoute />,
      testDeps({
        "GET /api/calendar": jsonAnswer({
          from: inDays(0, 0),
          to: inDays(28, 0),
          runs: [],
          projects: [
            project("p-ready", "Ready one", { readyToUpload: true }),
            project("p-review", "Held one", {
              state: "pending",
              finishedAt: null,
              needs: "review",
            }),
            project("p-failed", "Broken one", { state: "failed", needs: "failed" }),
            project("p-wait", "Waiting one", {
              state: "running",
              finishedAt: null,
              limitWaits: [
                {
                  name: "Codex",
                  stage: "images",
                  resetsAt: inDays(0, 14),
                  retryAt: inDays(0, 14),
                },
              ],
            }),
            project("p-done", "Uploaded one", {}),
          ],
          queued: [],
        }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
      }),
    );
    const needs = await screen.findByRole("list", { name: "Needs you" });
    const rows = within(needs).getAllByRole("listitem");
    // Waiting for the person first, then ready to upload; a plain finished one is not here.
    expect(rows.map((row) => within(row).getAllByRole("link")[0]?.textContent)).toEqual([
      "Held one",
      "Broken one",
      "Ready one",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("Waiting for your review")).not.toBeNull();
    expect(
      within(rows[0] as HTMLElement)
        .getByRole("link", { name: "Open to review" })
        .getAttribute("href"),
    ).toBe("/projects/p-review");
    expect(
      within(rows[1] as HTMLElement).getByRole("link", { name: "Open to fix" }),
    ).not.toBeNull();
    expect(
      within(rows[2] as HTMLElement).getByRole("button", { name: "Prepare upload" }),
    ).not.toBeNull();
    // On its day, a project waiting for CLI limits says when they reset.
    const time = new Date(inDays(0, 14)).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    expect(screen.getByText(`Waiting for Codex limits (resets at ${time})`)).not.toBeNull();
    // The schedules themselves are edited from the calendar's own Schedules tab.
    expect(screen.getByRole("tab", { name: /^Schedules/ })).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Edit schedules" })).toBeNull();
  });
});

describe("the batch queue", () => {
  it("shows every queued video in its order, and a paused one as paused (Projects no longer repeats it)", async () => {
    const item = (projectId: string, title: string, position: number, state: string) => ({
      projectId,
      title,
      batchId: "batch-1",
      position,
      state,
      queuedAt: inDays(0, 1),
    });
    renderRouted(
      <CalendarRoute />,
      testDeps({
        "GET /api/calendar": jsonAnswer({
          from: inDays(0, 0),
          to: inDays(28, 0),
          runs: [],
          projects: [
            {
              id: "q2",
              title: "Second",
              state: "paused",
              createdAt: inDays(0, 1),
              finishedAt: null,
              scheduleId: null,
              needs: "paused",
            },
          ],
          queued: [item("q2", "Second", 1, "active"), item("q1", "First", 0, "queued")],
        }),
        "GET /api/schedules": jsonAnswer({ schedules: [] }),
      }),
    );
    const queue = await screen.findByRole("list", { name: "Batch queue" });
    const rows = within(queue).getAllByRole("listitem");
    expect(rows.map((row) => within(row).getByRole("link").textContent)).toEqual([
      "First",
      "Second",
    ]);
    expect(within(rows[0] as HTMLElement).getByText("1 in line")).not.toBeNull();
    expect(within(rows[0] as HTMLElement).getByText("Waiting its turn")).not.toBeNull();
    expect(within(rows[1] as HTMLElement).getByText("Paused")).not.toBeNull();
  });
});

describe("suggested topics", () => {
  it("offers the sign-in fix when suggesting topics failed, and asks again once signed in", async () => {
    const user = userEvent.setup();
    const failing = summary(scheduleId, "Lore", ["Cleopatra"], {
      topicGeneration: { mode: "hold", keepAtLeast: 10, llm: { provider: "codex", model: "gpt" } },
      topics: {
        held: 0,
        generatingSince: null,
        generatedAt: null,
        failedAt: inDays(0, 1),
        error:
          "Couldn't generate topics: codex (gpt) did not answer: The Codex CLI is not signed in, or its sign-in has expired. Slopify tries again in 5 minutes.",
      },
    });
    const generate = vi.fn(jsonAnswer({ started: true }));
    renderRouted(
      <CalendarRoute />,
      deps(
        {
          "POST /api/providers/health": jsonAnswer({
            checkedAt: inDays(0, 1),
            providers: [
              {
                id: "codex",
                displayName: "Codex",
                family: "llm",
                state: "ok",
                checks: [{ label: "Signed in", state: "ok", detail: "" }],
              },
            ],
          }),
          [`POST /api/schedules/${scheduleId}/topics/generate`]: generate,
        },
        [failing],
      ),
    );
    const panel = await screen.findByRole("region", { name: "Suggested topics for Lore" });
    const alert = within(panel).getByRole("alert");
    expect(within(alert).getByRole("button", { name: "Copy sign-in command" })).not.toBeNull();
    await user.click(within(alert).getByRole("button", { name: "Check again" }));
    await waitFor(() => expect(generate).toHaveBeenCalledOnce());
  });

  const holding = summary(scheduleId, "Lore", ["Cleopatra"], {
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
                title: "Imhotep",
                rank: 0,
                createdAt: "x",
              },
              {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
                title: "Xerxes",
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
    await user.click(await within(panel).findByRole("button", { name: "Queue Imhotep" }));
    await waitFor(() => expect(approve).toHaveBeenCalledOnce());
    await user.click(within(panel).getByRole("button", { name: "Reject Xerxes" }));
    await waitFor(() => expect(reject).toHaveBeenCalledOnce());
    await user.click(within(panel).getByRole("button", { name: "Queue all 2" }));
    await waitFor(() => expect(all).toHaveBeenCalledOnce());
    expect(within(panel).getByText("Keeps at least 10 topics queued.")).not.toBeNull();
  });
});

describe("the Schedules tab", () => {
  // What the Schedules view reads beyond the calendar's own summary.
  const full = (id: string, name: string, items: readonly string[], over = {}) =>
    summary(id, name, items, {
      topicKeyword: "Topic",
      values: {},
      brief: null,
      topicGeneration: { mode: "off", keepAtLeast: 3, llm: null },
      topics: { held: 0, generatingSince: null, generatedAt: null, failedAt: null, error: null },
      ...over,
    });
  const tabDeps = () =>
    deps(
      {
        "GET /api/project-templates": jsonAnswer({
          templates: [{ id: templateId, name: "Stories", version: 1, updatedAt: inDays(0, 0) }],
        }),
        "GET /api/channels": jsonAnswer({ channels: [] }),
        [`GET /api/schedules/${scheduleId}`]: jsonAnswer({
          schedule: full(scheduleId, "Lore", ["Cleopatra", "Hypatia"]),
          runs: [],
        }),
        [`GET /api/schedules/${otherId}`]: jsonAnswer({
          schedule: full(otherId, "Other", ["Imhotep"]),
          runs: [],
        }),
      },
      [
        full(scheduleId, "Lore", ["Cleopatra", "Hypatia"]),
        full(otherId, "Other", ["Imhotep"], { status: "paused" }),
      ],
    );

  it("holds every schedule, its row actions and New schedule, in place of the weeks", async () => {
    const user = userEvent.setup();
    renderRouted(<CalendarRoute />, tabDeps());
    const tab = await screen.findByRole("tab", { name: /^Schedules/ });
    expect(tab.getAttribute("aria-selected")).toBe("false");
    await within(tab).findByText("2");
    await user.click(tab);
    expect(tab.getAttribute("aria-selected")).toBe("true");
    const list = await screen.findByRole("list", { name: "Saved schedules" });
    expect(within(list).getByRole("button", { name: "Pause Lore" })).not.toBeNull();
    expect(within(list).getByRole("button", { name: "Resume Other" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /New schedule/ })).not.toBeNull();
    // The weeks and their primary action wait on the other tab.
    expect(screen.queryByRole("button", { name: "Add to calendar" })).toBeNull();
    expect(document.querySelector(".sl-cal-week")?.closest("[hidden]")).not.toBeNull();
    await screen.findByRole("region", { name: "Lore detail" });
    await user.click(screen.getByRole("tab", { name: "Coming weeks" }));
    expect(screen.getByRole("button", { name: "Add to calendar" })).not.toBeNull();
  });

  it("opens on the schedule the address names and reports a new pick", async () => {
    const user = userEvent.setup();
    const onSchedule = vi.fn();
    const onTab = vi.fn();
    renderRouted(
      <CalendarRoute tab="schedules" schedule={otherId} onTab={onTab} onSchedule={onSchedule} />,
      tabDeps(),
    );
    await screen.findByRole("region", { name: "Other detail" });
    await user.click(screen.getByRole("button", { name: "Lore" }));
    expect(onSchedule).toHaveBeenCalledWith(scheduleId);
    await user.click(screen.getByRole("tab", { name: "Coming weeks" }));
    expect(onTab).toHaveBeenCalledWith("weeks");
  });
});
