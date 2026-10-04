import { scheduleSummarySchema } from "@app/slices/schedules/schema.js";
import { act, cleanup, fireEvent, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { ToastProvider } from "@/components/kit/toast";
import { renderApp, testDeps } from "@/test-app";
import { InlineTopics, shownAtFirst } from "./inline-topics";

afterEach(cleanup);

const schedule = scheduleSummarySchema.parse({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Long queue",
  templateId: "11111111-1111-4111-8111-111111111111",
  templateVersion: 1,
  cadence: { kind: "daily", time: "09:00" },
  timezone: "UTC",
  missedPolicy: "skip",
  overlapPolicy: "skip",
  spendLimitCents: null,
  items: Array.from({ length: 500 }, (_, index) => ({
    title: `Topic number ${String(index + 1)}`,
    values: {},
  })),
  topicKeyword: "Topic",
  status: "active",
  version: 1,
  nextRunAt: "2026-09-14T09:00:00.000Z",
  createdAt: "2026-09-12T00:00:00.000Z",
  updatedAt: "2026-09-12T00:00:00.000Z",
  deletedAt: null,
});

// The audit's 500-topic queue (the most a queue holds). The first render shows the first
// rows; Show all draws every one. Both times are printed for the release notes' measurement.
it("renders a 500-topic queue and shows all of it on request", () => {
  const start = performance.now();
  renderApp(
    <ToastProvider>
      <InlineTopics schedule={schedule} />
    </ToastProvider>,
    testDeps({}),
  );
  const firstMs = performance.now() - start;
  const list = screen.getByRole("list", { name: "Topics of Long queue" });
  expect(within(list).getAllByRole("listitem")).toHaveLength(shownAtFirst);

  const before = performance.now();
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Show all 500 topics" }));
  });
  const allMs = performance.now() - before;
  expect(within(list).getAllByRole("listitem")).toHaveLength(500);
  process.stdout.write(
    `500-topic queue: first render ${firstMs.toFixed(0)} ms (${String(shownAtFirst)} rows), Show all ${allMs.toFixed(0)} ms\n`,
  );
});
