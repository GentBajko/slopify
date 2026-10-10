import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "./external.fake.js";
import {
  answerExternalReview,
  externalReviewById,
  openExternalReview,
  waitingExternalReviews,
} from "./external-repo.js";

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
