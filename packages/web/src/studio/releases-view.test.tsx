import type { ReleaseCalendar } from "@app/slices/studio/calendar.js";
import { cleanup, screen, waitFor } from "@testing-library/react";
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
  const earlier = screen.getByRole("button", { name: "Earlier" });
  expect(earlier.hasAttribute("disabled")).toBe(true);
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Later" }));
  await waitFor(() => expect(asked).toContain("4"));
  // Weeks three and four: only the free time twenty days ahead.
  await waitFor(() => expect(screen.queryByText("✓ Scheduled · checks clear")).toBeNull());
  expect(screen.getAllByRole("combobox")).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "Back to this week" }));
  expect(await screen.findByText("✓ Scheduled · checks clear")).toBeTruthy();
  expect(screen.getByText("The next two weeks")).toBeTruthy();
});
