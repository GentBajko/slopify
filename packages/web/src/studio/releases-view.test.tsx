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
