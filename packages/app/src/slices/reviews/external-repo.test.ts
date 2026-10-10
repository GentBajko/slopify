import { afterEach, expect, it } from "vitest";
import { addUnreadableReview, waitingReviewFixture } from "./external-repo.fake.js";
import {
  answerExternalReview,
  externalReviewById,
  openExternalReview,
  settleExternalReviews,
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

it("still passes every due review when one of them can't be read back", () => {
  const f = waitingReviewFixture();
  open.push(f);
  addUnreadableReview(f);
  expect(
    settleExternalReviews(f.h.deps.db, new Date("2026-09-10T02:00:00.000Z")).map((row) => row.id),
  ).toEqual(["er1", "er2"]);
  expect(externalReviewById(f.h.deps.db, "p1", "er1")?.state).toBe("auto-passed");
});

it("refuses a verdict on a canceled run's review, which never passes", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE revision_work SET state='canceled' WHERE id='images-work'").run();
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "canceled" });
  expect(externalReviewById(db, "p1", "er1")?.state).toBe("waiting");
});

// A canceled run reads canceled by its stages (`derive`), whatever its work row says: one a
// restart held before canceled work was kept canceled (`recoverWork`) is still canceled.
it("treats a review of a run with a canceled step as canceled, even with its work pending", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='images-work'").run();
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio','p1','audio','generate','canceled')",
  ).run();
  expect(waitingExternalReviews(db)).toEqual([]);
  expect(settleExternalReviews(db, new Date("2026-09-11T00:00:00.000Z"))).toEqual([]);
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "canceled" });
  expect(externalReviewById(db, "p1", "er1")?.state).toBe("waiting");
});
