import { randomUUID } from "node:crypto";
import { expect, it, vi } from "vitest";
import { must, startFixture } from "./draft.fake.js";
import { reviewDraft } from "./review.js";
import { createDraft, readDraft } from "./service.js";
import { startPlayDraft } from "./start.js";

const batch = vi.hoisted(() => ({ drop: false }));
vi.mock("../batch/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../batch/index.js")>();
  return {
    ...actual,
    enqueueBatch: (...args: Parameters<typeof actual.enqueueBatch>) => {
      const queue = actual.enqueueBatch(...args);
      return batch.drop ? queue.slice(0, 1) : queue;
    },
  };
});

it("refuses a Start that would create fewer videos than were reviewed, and creates nothing", async () => {
  const h = startFixture();
  const id = randomUUID();
  try {
    const document = {
      ...h.document,
      variants: [
        { id: randomUUID(), title: "Second", values: {} },
        { id: randomUUID(), title: "Third", values: {} },
      ],
    };
    must(createDraft(h.deps, { id, document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    expect(review.runs).toHaveLength(3);
    const input = { draftId: id, baseVersion: 1, reviewId: review.id };

    batch.drop = true;
    expect(await startPlayDraft(h.deps, input)).toMatchObject({
      ok: false,
      reason: "stale-review",
    });
    for (const table of ["projects", "batches", "project_queue", "play_start_receipts"])
      expect(h.deps.db.prepare(`SELECT * FROM ${table}`).all()).toHaveLength(0);
    // The draft is editable again and needs a fresh review.
    expect(must(readDraft(h.deps, id))).toMatchObject({
      pendingStart: null,
      start: null,
      review: null,
    });

    batch.drop = false;
    const again = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    const created = must(
      await startPlayDraft(h.deps, { draftId: id, baseVersion: 1, reviewId: again.id }),
    );
    expect(created.projectIds).toHaveLength(3);
    expect(created.queue).toHaveLength(3);
  } finally {
    batch.drop = false;
    h.close();
  }
});
