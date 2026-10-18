import type { AutopilotView } from "@app/slices/autopilot/model.js";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { Autopilot, forecastLine } from "./autopilot";

afterEach(cleanup);

const forecast: AutopilotView["forecast"] = {
  readyCount: 3,
  daysAhead: 9,
  coveredUntil: "2026-10-27T09:00:00.000Z",
  runsDryAt: "2026-10-30T09:00:00.000Z",
  coveredBeyondWindow: false,
  perSchedule: [],
};
const view = (warnings: AutopilotView["warnings"]): AutopilotView => ({
  forecast,
  warnings,
  checkedAt: "2026-10-18T09:00:00.000Z",
  weekly: {
    since: "a",
    until: "b",
    finished: 4,
    failed: [{ projectId: "p1", title: "Rope", stage: "Narration", reason: "The voice refused." }],
    failedMore: 0,
    cost: 2.5,
    unpriced: 1,
    apiEquivalent: null,
    plans: [],
  },
  weeklyNotify: false,
});
const disk = {
  key: "disk-low",
  severity: "problem" as const,
  text: "Only 2.0 GB is free on the disk Slopify saves to.",
  fix: { kind: "settings" as const, section: "storage" as const, label: "Open Backup & storage" },
};

describe("forecastLine", () => {
  it("says how far ahead the content is and when the queue runs dry", () => {
    expect(forecastLine(forecast)).toMatch(/^9 days of content ready · the queue runs dry on /);
    expect(forecastLine({ ...forecast, daysAhead: 1, runsDryAt: null })).toBe(
      "1 day of content ready",
    );
    expect(
      forecastLine({ ...forecast, daysAhead: 60, coveredBeyondWindow: true, runsDryAt: null }),
    ).toBe("60+ days of content ready");
    expect(forecastLine({ ...forecast, daysAhead: null, runsDryAt: null })).toBeNull();
  });
});

describe("Autopilot", () => {
  it("shows the forecast, each warning with its fix and Hide, and the last seven days folded", async () => {
    const hidden: unknown[] = [];
    let warnings: AutopilotView["warnings"] = [disk];
    renderRouted(
      <Autopilot channelId={null} />,
      testDeps({
        "GET /api/home/autopilot": (request) => jsonAnswer(view(warnings))(request),
        "POST /api/home/autopilot/snooze": async (request) => {
          hidden.push(await request.json());
          warnings = [];
          return jsonAnswer({ key: "disk-low", until: "x" })(request);
        },
      }),
    );
    expect(await screen.findByText(/^9 days of content ready/)).toBeTruthy();
    expect(screen.getByText(disk.text)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open Backup & storage" }).getAttribute("href")).toBe(
      "/settings?section=storage",
    );
    expect(screen.getByText("Last 7 days · 4 made · 1 failed · $2.50 + 1 unpriced")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Rope" }).getAttribute("href")).toBe("/projects/p1");
    fireEvent.click(screen.getByRole("button", { name: "Hide" }));
    await waitFor(() => expect(screen.queryByText(disk.text)).toBeNull());
    expect(hidden).toEqual([{ key: "disk-low" }]);
  });

  it("links a schedule's warning to that schedule", async () => {
    renderRouted(
      <Autopilot channelId="c1" />,
      testDeps({
        "GET /api/home/autopilot": jsonAnswer(
          view([
            {
              key: "few-topics:s1:2",
              severity: "warning",
              text: "“Canals” has 2 topics left.",
              fix: { kind: "schedule", scheduleId: "s1", label: "Open the schedule" },
            },
          ]),
        ),
      }),
    );
    expect(
      (await screen.findByRole("link", { name: "Open the schedule" })).getAttribute("href"),
    ).toBe("/schedules/s1");
  });

  it("says when the check didn't load, instead of reading as fine", async () => {
    renderRouted(<Autopilot channelId={null} />, testDeps({}));
    expect(await screen.findByText(/autopilot check/i)).toBeTruthy();
  });
});
