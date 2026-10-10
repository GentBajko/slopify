import { afterEach, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import { waitingReviewFixture } from "./external.fake.js";
import {
  answerExternalReview,
  externalReviewById,
  openExternalReview,
  releaseDueReviews,
  settleExternalReviews,
  waitingExternalReviews,
} from "./external.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

it("keeps the first verdict and refuses the second", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  const first = answerExternalReview(db, {
    projectId: "p1",
    id: "er1",
    verdict: { passed: false, reasons: ["The hand has six fingers."] },
    by: "agent",
    at: "2026-09-10T00:30:00.000Z",
  });
  expect(first).toMatchObject({ ok: true, value: { state: "answered", answeredBy: "agent" } });
  const second = answerExternalReview(db, {
    projectId: "p1",
    id: "er1",
    verdict: { passed: true, reasons: [] },
    by: "agent",
    at: "2026-09-10T00:31:00.000Z",
  });
  expect(second).toMatchObject({ ok: false, reason: "answered" });
  expect(externalReviewById(db, "p1", "er1")?.verdict).toEqual({
    passed: false,
    reasons: ["The hand has six fingers."],
  });
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "nope",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:32:00.000Z",
    }),
  ).toEqual({ ok: false, reason: "not-found" });
});

it("lists a review only while the project's current version still wants it", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  expect(waitingExternalReviews(db).map((row) => row.id)).toEqual(["er1"]);
  db.prepare("DELETE FROM revision_work_reservations WHERE work_key='review:image:one'").run();
  expect(waitingExternalReviews(db)).toEqual([]);
});

it("leaves a canceled run's review out of the waiting list", () => {
  const f = waitingReviewFixture();
  open.push(f);
  f.h.deps.db.prepare("UPDATE revision_work SET state='canceled' WHERE id='images-work'").run();
  expect(waitingExternalReviews(f.h.deps.db)).toEqual([]);
});

it("opens a superseded review again when its step is asked again", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='superseded' WHERE id='er1'").run();
  const again = openExternalReview(db, {
    ...f.review,
    id: "er2",
    waitingSince: "2026-09-11T00:00:00.000Z",
    deadlineAt: "2026-09-11T02:00:00.000Z",
  });
  expect(again).toMatchObject({
    id: "er1",
    state: "waiting",
    deadlineAt: "2026-09-11T02:00:00.000Z",
  });
});

it("passes a review nobody answered once its two hours are up, and says so", () => {
  const f = waitingReviewFixture();
  open.push(f);
  f.h.deps.db
    .prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='images-work'")
    .run();
  const events: ProjectEvent[] = [];
  const ticks: string[] = [];
  const release = (at: string) =>
    releaseDueReviews({
      db: f.h.deps.db,
      now: () => new Date(at),
      emit: (_projectId, event) => events.push(event),
      tick: (projectId) => ticks.push(projectId),
    });
  expect(release("2026-09-10T01:59:59.000Z")).toBe(0);
  expect(release("2026-09-10T02:00:00.000Z")).toBe(1);
  expect(externalReviewById(f.h.deps.db, "p1", "er1")?.state).toBe("auto-passed");
  expect(
    f.h.deps.db.prepare("SELECT dispatch_state FROM revision_work WHERE id='images-work'").get(),
  ).toEqual({ dispatch_state: "allowed" });
  expect(events).toEqual([
    expect.objectContaining({
      type: "review.auto-passed",
      projectId: "p1",
      reviewId: "er1",
      stage: "images",
      itemKey: "image:one",
    }),
    { type: "project.updated", projectId: "p1" },
  ]);
  expect(ticks).toEqual(["p1"]);
  expect(release("2026-09-10T03:00:00.000Z")).toBe(0);
});

it("passes a paused project's review at its deadline too", () => {
  const f = waitingReviewFixture();
  open.push(f);
  f.h.deps.db.prepare("INSERT INTO project_controls(project_id,paused) VALUES ('p1',1)").run();
  expect(settleExternalReviews(f.h.deps.db, new Date("2026-09-10T02:00:00.000Z"))).toHaveLength(1);
});

it("never auto-passes a canceled run's review", () => {
  const f = waitingReviewFixture();
  open.push(f);
  f.h.deps.db.prepare("UPDATE revision_work SET state='canceled' WHERE id='images-work'").run();
  expect(settleExternalReviews(f.h.deps.db, new Date("2026-09-11T00:00:00.000Z"))).toEqual([]);
  expect(externalReviewById(f.h.deps.db, "p1", "er1")?.state).toBe("waiting");
});

it("supersedes the review of an item the current version no longer wants", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("DELETE FROM revision_work_reservations WHERE work_key='review:image:one'").run();
  expect(settleExternalReviews(db, new Date("2026-09-11T00:00:00.000Z"))).toEqual([]);
  expect(externalReviewById(db, "p1", "er1")?.state).toBe("superseded");
});
