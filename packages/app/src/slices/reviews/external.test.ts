import { afterEach, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import type { LogFields } from "../../kernel/log.js";
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
      log: { write: () => undefined },
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

// A second waiting review on p1, of another image.
function secondReview(f: ReturnType<typeof waitingReviewFixture>): void {
  const { db } = f.h.deps;
  db.prepare(
    `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state) VALUES ('review-piece-2','images-work','review:image:two','req','review-fp-2','{"kind":"local"}','pending','allowed')`,
  ).run();
  db.prepare(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES ('p1',?,'review:image:two','images-work','review-piece-2','review-fp-2')",
  ).run(f.revisionId);
  openExternalReview(db, {
    ...f.review,
    id: "er2",
    pieceId: "review-piece-2",
    workKey: "review:image:two",
    itemKey: "image:two",
    reviewFingerprint: "review-fp-2",
  });
}

it("still passes, announces and wakes the other reviews when one announcement throws", () => {
  const f = waitingReviewFixture();
  open.push(f);
  secondReview(f);
  const announced: string[] = [];
  const ticks: string[] = [];
  const logged: { event: string; fields: LogFields | undefined }[] = [];
  const passed = releaseDueReviews({
    db: f.h.deps.db,
    now: () => new Date("2026-09-10T02:00:00.000Z"),
    emit: (_projectId, event) => {
      if (event.type !== "review.auto-passed") return;
      if (event.reviewId === "er1") throw new Error("The hub is closed.");
      announced.push(event.reviewId);
    },
    tick: (projectId) => ticks.push(projectId),
    log: { write: (_level, event, fields) => logged.push({ event, fields }) },
  });
  expect(passed).toBe(2);
  expect(announced).toEqual(["er2"]);
  expect(ticks).toEqual(["p1"]);
  expect(logged).toEqual([
    {
      event: "review.deadline",
      fields: { projectId: "p1", detail: expect.stringContaining("The hub is closed.") },
    },
  ]);
});

it("neither passes nor accepts a verdict for a review of a project in the Trash", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare(
    "INSERT INTO project_trash(project_id,deleted_at) VALUES ('p1','2026-09-10T01:00:00.000Z')",
  ).run();
  expect(settleExternalReviews(db, new Date("2026-09-11T00:00:00.000Z"))).toEqual([]);
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toEqual({ ok: false, reason: "trashed" });
  expect(externalReviewById(db, "p1", "er1")?.state).toBe("waiting");
});

it("answers superseded for a review whose item was just replaced, before any settle", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("DELETE FROM revision_work_reservations WHERE work_key='review:image:one'").run();
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "superseded" });
  expect(externalReviewById(db, "p1", "er1")).toMatchObject({ state: "superseded", verdict: null });
});
