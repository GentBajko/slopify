import type { StudioReport } from "@app/slices/studio/report.js";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { jsonAnswer, renderRouted, testDeps } from "@/test-app";
import { StudioReportSection } from "./studio-report.js";

afterEach(cleanup);

const channelId = "00000000-0000-4000-8000-000000000001";
const report: StudioReport = {
  importedAt: "2026-10-04T10:00:00.000Z",
  chartMetric: "Engaged views",
  from: "2026-09-01",
  to: "2026-09-04",
  columns: [{ label: "Engaged views", kind: "number" }],
  totals: [30],
  rows: [
    {
      videoId: "aaaaaaaaaaa",
      title: "The Lighthouse",
      published: "Sep 1, 2026",
      duration: 1800,
      values: [20],
      daily: [5, 5, 5, 5],
    },
    {
      videoId: "bbbbbbbbbbb",
      title: "The Harbour",
      published: "Sep 2, 2026",
      duration: 1800,
      values: [10],
      daily: [0, 4, 3, 3],
    },
  ],
};

it("shows a video's own chart only once its row is opened", async () => {
  renderRouted(
    <StudioReportSection channelId={channelId} />,
    testDeps({
      [`GET /api/studio/channels/${channelId}/report`]: jsonAnswer({ report, projects: {} }),
    }),
  );
  await screen.findByRole("button", { name: "Show the chart of The Lighthouse" });
  expect(screen.queryByRole("img", { name: "Engaged views for The Lighthouse" })).toBeNull();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Show the chart of The Lighthouse" }));
  expect(screen.getByRole("img", { name: "Engaged views for The Lighthouse" })).toBeTruthy();
  expect(screen.queryByRole("img", { name: "Engaged views for The Harbour" })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Hide the chart of The Lighthouse" }));
  expect(screen.queryByRole("img", { name: "Engaged views for The Lighthouse" })).toBeNull();
});
