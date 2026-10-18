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

it("says a run waits for Mark ready instead of calling it queued", () => {
  render(<ComingUp runs={[run, { ...run, at: "2026-10-22T20:00:00.000Z", notReady: true }]} />);
  expect(screen.getAllByText("Queued")).toHaveLength(1);
  expect(screen.getByText("Waits for Mark ready").getAttribute("title")).toContain(
    "Open the template's studio and press Mark ready.",
  );
});
