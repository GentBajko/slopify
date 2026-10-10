import { afterEach, expect, it } from "vitest";
import {
  addReplacementReview,
  addUnreadableReview,
  waitingReviewFixture,
} from "./external-repo.fake.js";
import {
  answerExternalReview,
  openExternalReview,
  settleExternalReviews,
} from "./external-repo.js";
import { externalReviewById } from "./external-rows.js";
import { reviewStanding, waitingExternalReviews } from "./external-waiting.js";

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
  addReplacementReview(f);
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

// A canceled step reads canceled by its stage, whatever its work row says: one a restart held
// before canceled work was kept canceled (`recoverWork`) is still canceled.
it("treats a review of a canceled step as canceled, even with its work pending", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE revision_work SET dispatch_state='held' WHERE id='images-work'").run();
  db.prepare("UPDATE stages SET state='canceled' WHERE id='images'").run();
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

// Retrying one step of a canceled run admits it again (`recoverProject`): its reviews wait
// for their verdict while the steps left canceled stay so.
it("keeps a review of a step retried after a cancel waiting, while another step stays canceled", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio','p1','audio','generate','canceled')",
  ).run();
  expect(waitingExternalReviews(db).map((row) => row.id)).toEqual(["er1"]);
  expect(
    settleExternalReviews(db, new Date("2026-09-10T02:00:00.000Z")).map((row) => row.id),
  ).toEqual(["er1"]);
  expect(externalReviewById(db, "p1", "er1")?.state).toBe("auto-passed");
});

// A step's reservations go with it, so a review whose step is gone was replaced, and no new
// one waits.
it("refuses a verdict on a review whose step is gone, as replaced", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("DELETE FROM revision_work WHERE id='images-work'").run();
  const review = externalReviewById(db, "p1", "er1");
  if (review === undefined) throw new Error("the review row stays");
  expect(reviewStanding(db, review)).toBe("replaced-pending");
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "replaced-pending" });
});

// One order for every reader: get_external_review and a refused verdict give the same reason.
// A canceled run's replaced review says canceled: no new one waits.
it("refuses a verdict on a canceled run's replaced review as canceled, as it reads", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE revision_work SET state='canceled' WHERE id='images-work'").run();
  db.prepare("DELETE FROM revision_work_reservations WHERE work_key='review:image:one'").run();
  const review = externalReviewById(db, "p1", "er1");
  if (review === undefined) throw new Error("the review row stays");
  expect(reviewStanding(db, review)).toBe("canceled");
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "canceled" });
});

// A verdict kept is said first: Restore would not bring an answered review back.
it("refuses a second verdict in the Trash as answered, as it reads", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='auto-passed' WHERE id='er1'").run();
  db.prepare("INSERT INTO project_trash VALUES ('p1','2026-09-11T00:00:00.000Z')").run();
  const review = externalReviewById(db, "p1", "er1");
  if (review === undefined) throw new Error("the review row stays");
  expect(reviewStanding(db, review)).toBe("auto-passed");
  expect(
    answerExternalReview(db, {
      projectId: "p1",
      id: "er1",
      verdict: { passed: true, reasons: [] },
      by: "agent",
      at: "2026-09-10T00:30:00.000Z",
    }),
  ).toMatchObject({ ok: false, reason: "auto-passed" });
});

// Trash is said only when Restore would bring the review back: a canceled run's or a replaced
// review stays closed after Restore.
it("says a canceled run's review in the Trash is canceled, and a replaced one out of date", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("INSERT INTO project_trash VALUES ('p1','2026-09-11T00:00:00.000Z')").run();
  const standing = (): string => {
    const review = externalReviewById(db, "p1", "er1");
    if (review === undefined) throw new Error("the review row stays");
    return reviewStanding(db, review);
  };
  expect(standing()).toBe("trashed");
  db.prepare("UPDATE external_reviews SET state='superseded' WHERE id='er1'").run();
  expect(standing()).toBe("replaced-pending");
  db.prepare("UPDATE revision_work SET state='canceled' WHERE id='images-work'").run();
  expect(standing()).toBe("canceled");
});

// A canceled step's review marked replaced says canceled: no new one waits for it.
it("says a replaced review of a canceled step is canceled", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='superseded' WHERE id='er1'").run();
  db.prepare("UPDATE stages SET state='canceled' WHERE id='images'").run();
  const review = externalReviewById(db, "p1", "er1");
  if (review === undefined) throw new Error("the review row stays");
  expect(reviewStanding(db, review)).toBe("canceled");
});

// Only a review of the same item takes its place: another item's waiting review doesn't.
it("says a replaced review with no new one for its item is replaced-pending", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  addUnreadableReview(f);
  db.prepare("UPDATE external_reviews SET state='superseded' WHERE id='er1'").run();
  const review = externalReviewById(db, "p1", "er1");
  if (review === undefined) throw new Error("the review row stays");
  expect(reviewStanding(db, review)).toBe("replaced-pending");
});
