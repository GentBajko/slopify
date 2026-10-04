import { expect, it, vi } from "vitest";

vi.mock("../src/browser.js", () => ({
  browserApi: () => ({
    runtime: {
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
    },
    storage: { local: { get: async () => ({}), set: async () => {} } },
  }),
}));

const { viewToday } = await import("../src/background.js");

const view =
  "https://studio.youtube.com/channel/UCabc/analytics/tab-content/period-default/explore?time_period=1741420800000%2C1790924400000&metric=ENGAGED_VIEWS";

it("keeps the start and moves the end to the end of today in Pacific time", () => {
  // 4 Oct 2026 in summer time: the day ends at midnight PDT, 07:00 UTC on the 5th.
  const summer = new URL(viewToday(view, new Date("2026-10-04T15:00:00Z")));
  expect(summer.searchParams.get("time_period")).toBe(
    `1741420800000,${String(Date.parse("2026-10-05T07:00:00Z"))}`,
  );
  expect(summer.searchParams.get("metric")).toBe("ENGAGED_VIEWS");
  // 10 Dec 2026 in winter time: midnight PST is 08:00 UTC.
  const winter = new URL(viewToday(view, new Date("2026-12-10T15:00:00Z")));
  expect(winter.searchParams.get("time_period")).toBe(
    `1741420800000,${String(Date.parse("2026-12-11T08:00:00Z"))}`,
  );
});
