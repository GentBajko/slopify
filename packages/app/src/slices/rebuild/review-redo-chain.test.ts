import { afterEach, expect, it, vi } from "vitest";
import type { ReviewRecord } from "../reviews/model.js";

// Two redos that end without leaving "pending" (a save that failed to record their state) must
// not start each other again and again: each ended redo starts the project's next waiting one,
// and one chain tries each verdict once.
const stale: ReviewRecord[] = ["v1", "v2"].map((id) => ({
  id,
  projectId: "p1",
  revisionId: "r1",
  itemKey: `image:${id}`,
  stage: "images",
  itemFingerprint: "item",
  reviewFingerprint: "review",
  passed: false,
  reasons: ["Stray letters."],
  outcome: "redo",
  attempt: 1,
  action: null,
  actionAt: null,
  redoState: "pending",
  redoError: null,
  answeredBy: "model",
  actionBy: null,
  createdAt: "2026-11-21T10:00:00.000Z",
}));
let lookups = 0;
vi.mock("../reviews/repo.js", () => ({
  // ceiling: a runaway chain stops here instead of hanging the test.
  pendingRedos: () => (++lookups > 50 ? [] : stale),
  setRedoState: () => undefined,
}));
vi.mock("../revisions/repo.js", () => ({ currentRevisionId: () => "r1" }));
const recover = vi.fn(async () => ({ ok: true }));
vi.mock("./recovery.js", () => ({ recoverProject: recover }));

afterEach(() => {
  lookups = 0;
  recover.mockClear();
});

it("tries each waiting redo once per chain, so stuck redos never cycle", async () => {
  const { createReviewRedos } = await import("./review-redo.js");
  const redos = createReviewRedos();
  redos.bind({
    db: {},
    runner: { tick: () => undefined },
    log: { write: () => undefined },
    emit: () => undefined,
  } as never);
  redos.kick("p1");
  await vi.waitFor(() => expect(lookups).toBeGreaterThan(2));
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(recover).toHaveBeenCalledTimes(2);
  expect(lookups).toBeLessThan(50);
});
