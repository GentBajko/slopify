import type { ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { ReleasesView } from "./releases-view.js";

afterEach(cleanup);

const later = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

const calendar: ReleaseCalendar = {
  leadHours: 24,
  timeZone: "UTC",
  from: later(-24),
  until: later(14 * 24),
  entries: [
    {
      at: later(48),
      line: "1",
      series: "Stories To Sleep To",
      project: { id: "p1", title: "The Lighthouse | Stories To Sleep To" },
      items: [
        {
          short: 0,
          title: "The Lighthouse | Stories To Sleep To",
          at: later(48),
          uploadBy: later(24),
          state: "scheduled",
          checks: "ok",
          videoId: "lKS3FAjekpI",
        },
        {
          short: 1,
          title: "The keeper's lamp",
          at: later(52),
          uploadBy: later(-2),
          state: "late",
          checks: null,
          videoId: null,
        },
      ],
    },
    { at: later(96), line: "2", series: "", project: null, items: [] },
  ],
  candidates: [
    { id: "p2", title: "The Harbour | Stories To Sleep To", series: "Stories To Sleep To" },
  ],
};

it("shows each release with its state, and puts a finished project into a free time", async () => {
  const puts: unknown[] = [];
  renderRouted(
    <ReleasesView />,
    testDeps({
      "GET /api/studio/releases": jsonAnswer(calendar),
      "PUT /api/studio/releases/p2": async (request) => {
        puts.push(await request.json());
        return jsonAnswer({ releases: [] })(request);
      },
    }),
  );
  expect(await screen.findByText("✓ Scheduled · checks clear")).toBeTruthy();
  expect(screen.getByText("Late · upload now")).toBeTruthy();
  expect(screen.getByText("The keeper's lamp")).toBeTruthy();
  const user = userEvent.setup();
  await user.selectOptions(screen.getByRole("combobox"), "p2");
  await user.click(screen.getByRole("button", { name: "Put it here" }));
  await waitFor(() => expect(puts).toEqual([{ short: 0, at: calendar.entries[1]?.at, line: "2" }]));
});

it("pages through the coming weeks with Earlier and Later and comes back to this week", async () => {
  const user = userEvent.setup();
  const asked: string[] = [];
  const far = {
    ...calendar,
    entries: [
      ...calendar.entries,
      { at: later(20 * 24), line: "3", series: "", project: null, items: [] },
    ],
  };
  renderRouted(
    <ReleasesView />,
    testDeps({
      "GET /api/studio/releases": (request) => {
        asked.push(new URL(request.url).searchParams.get("weeks") ?? "");
        return jsonAnswer(far)(request);
      },
    }),
  );
  expect(await screen.findByText("The next two weeks")).toBeTruthy();
  // Nothing earlier than this week is listed, so there is no Earlier to press.
  expect(screen.queryByRole("button", { name: "Earlier" })).toBeNull();
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Later" }));
  await waitFor(() => expect(asked).toContain("4"));
  // Weeks three and four: only the free time twenty days ahead.
  await waitFor(() => expect(screen.queryByText("✓ Scheduled · checks clear")).toBeNull());
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Earlier" })).not.toBeNull();
  await user.click(screen.getByRole("button", { name: "Back to this week" }));
  expect(await screen.findByText("✓ Scheduled · checks clear")).toBeTruthy();
  expect(screen.getByText("The next two weeks")).toBeTruthy();
});

// A schedule's free time lists the short times it gives too, all on the schedule's clock with
// its zone named; Kiritimati (UTC+14) is no browser's zone in a test run.
it("lists a free time's short times on its line's clock", async () => {
  const shortAt = later(100);
  renderRouted(
    <ReleasesView />,
    testDeps({
      "GET /api/studio/releases": jsonAnswer({
        ...calendar,
        entries: [
          {
            at: later(96),
            line: "2",
            series: "",
            project: null,
            items: [],
            timeZone: "Pacific/Kiritimati",
            shortsAt: [shortAt],
          },
        ],
      }),
    }),
  );
  const clock = new Intl.DateTimeFormat(undefined, {
    timeZone: "Pacific/Kiritimati",
    timeStyle: "short",
  });
  expect(
    await screen.findByText(new RegExp(`^Short: .*${clock.format(new Date(shortAt))} Kiritimati$`)),
  ).toBeTruthy();
  expect(
    screen.getByText(new RegExp(`${clock.format(new Date(later(96)))} Kiritimati$`)),
  ).toBeTruthy();
});

it("lists finished videos with no release time and gives one a time", async () => {
  const user = userEvent.setup();
  const puts: unknown[] = [];
  renderRouted(
    <ReleasesView />,
    testDeps({
      "GET /api/studio/releases": jsonAnswer({ ...calendar, entries: [] }),
      "GET /api/schedules": jsonAnswer({ schedules: [] }),
      "PUT /api/studio/releases/p2": async (request) => {
        puts.push(await request.json());
        return jsonAnswer({ releases: [] })(request);
      },
    }),
  );
  // No release times yet: the way to get them, as a button, not a path in words.
  expect(
    await screen.findByRole("heading", { name: "No release times in the next two weeks" }),
  ).toBeTruthy();
  expect(screen.getByRole("link", { name: "New schedule" }).getAttribute("href")).toBe(
    "/calendar?tab=schedules",
  );
  const list = screen.getByRole("list", { name: "Finished, no release time yet" });
  expect(
    within(list).getByRole("link", { name: "The Harbour | Stories To Sleep To" }),
  ).toBeTruthy();
  await user.click(
    within(list).getByRole("button", {
      name: "Set a release time for The Harbour | Stories To Sleep To",
    }),
  );
  // Only a time to set: there is nothing to take back yet.
  expect(within(list).queryByRole("button", { name: "Not scheduled" })).toBeNull();
  fireEvent.change(within(list).getByLabelText("Long video: release"), {
    target: { value: "2026-11-02T18:00" },
  });
  await user.click(within(list).getByRole("button", { name: "Save" }));
  await waitFor(() => expect(puts).toEqual([{ short: 0, at: "2026-11-02T18:00:00.000Z" }]));
});
