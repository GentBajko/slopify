import { afterEach, expect, it } from "vitest";
import type { ProjectEvent } from "../../kernel/events.js";
import type { LogFields } from "../../kernel/log.js";
import { releaseDueReviews } from "./external-release.js";
import { waitingReviewFixture } from "./external-repo.fake.js";
import { openExternalReview } from "./external-repo.js";
import { externalReviewById } from "./external-rows.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
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

it("names the passed item as the project page shows it", () => {
  const f = waitingReviewFixture();
  open.push(f);
  f.h.deps.db.prepare("UPDATE external_reviews SET item_key='image:hill' WHERE id='er1'").run();
  const events: ProjectEvent[] = [];
  releaseDueReviews({
    db: f.h.deps.db,
    now: () => new Date("2026-09-10T02:00:00.000Z"),
    emit: (_projectId, event) => events.push(event),
    tick: () => undefined,
    log: { write: () => undefined },
  });
  expect(events[0]).toMatchObject({ type: "review.auto-passed", item: "image 2" });
});
