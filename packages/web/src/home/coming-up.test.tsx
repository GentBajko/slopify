import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ComingUp } from "./coming-up";

afterEach(cleanup);

const run = {
  at: "2026-10-21T20:00:00.000Z",
  scheduleId: "11111111-1111-4111-8111-111111111111",
  scheduleName: "Nightly",
  scheduleVersion: 1,
  paused: false,
  templateId: "22222222-2222-4222-8222-222222222222",
  templateVersion: 1,
  templateName: "Crime",
  index: null,
  topic: null,
  topicSource: "template" as const,
  renderedTitle: "Crime",
  prepared: null,
  notReady: false,
  templateKind: "project" as const,
};

it("says a run is skipped until its template is approved, and where, instead of calling it queued", () => {
  render(<ComingUp runs={[run, { ...run, at: "2026-10-22T20:00:00.000Z", notReady: true }]} />);
  expect(screen.getAllByText("Queued")).toHaveLength(1);
  expect(screen.getByText("Skipped until approved")).not.toBeNull();
  // What to do is on the row, not only on hover.
  expect(
    screen.getByText("Nightly · Crime · To run it, approve a version in Edit template"),
  ).not.toBeNull();
});

// Home, Calendar and the schedule all read a run on its schedule's clock; a zone that isn't
// this browser's is named. Kiritimati (UTC+14) is no browser's zone in a test run.
it("reads a run's time on its schedule's clock and names that zone", () => {
  render(<ComingUp runs={[{ ...run, timezone: "Pacific/Kiritimati" }]} />);
  const time = new Intl.DateTimeFormat(undefined, {
    timeZone: "Pacific/Kiritimati",
    timeStyle: "short",
  }).format(new Date(run.at));
  expect(screen.getByText(new RegExp(`${time} Kiritimati · Crime$`))).toBeTruthy();
});
