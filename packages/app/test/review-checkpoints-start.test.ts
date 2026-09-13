import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { listCheckpoints } from "../src/slices/checkpoints/index.js";
import { must, startFixture } from "../src/slices/play-drafts/draft.fake.js";
import { reviewDraft } from "../src/slices/play-drafts/review.js";
import { createDraft, readDraft, saveDraft } from "../src/slices/play-drafts/service.js";
import { startPlayDraft } from "../src/slices/play-drafts/start.js";
import { uploadDraftAttachment } from "../src/slices/play-drafts/uploads.js";

it.each([false, true])(
  "atomically binds a reviewed Video gate and replays its receipt after reopen (batch=%s)",
  async (batch) => {
    const h = startFixture();
    try {
      const id = randomUUID();
      const attachmentId = randomUUID();
      const document = {
        ...h.document,
        variants: batch ? [{ id: randomUUID(), title: "Second", values: {} }] : [],
        form: {
          ...h.document.form,
          checkpoints: ["video"] as const,
          sources: {
            ...h.document.form.sources,
            images: "provide" as const,
            video: "generate" as const,
          },
          provided: { ...h.document.form.provided, images: [{ attachmentId, name: "image.png" }] },
        },
      };
      must(createDraft(h.deps, { id, document }));
      must(
        await uploadDraftAttachment(h.deps, {
          draftId: id,
          attachmentId,
          content: (async function* () {
            yield Buffer.from("image fixture");
          })(),
        }),
      );
      const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
      expect(review.checkpointSet).toHaveLength(batch ? 2 : 1);
      h.reopen();
      expect(must(readDraft(h.deps, id)).draft.document.form.checkpoints).toEqual(["video"]);
      const input = { draftId: id, baseVersion: 1, reviewId: review.id };
      const result = must(await startPlayDraft(h.deps, input));
      expect(result.checkpointSet).toHaveLength(batch ? 2 : 1);
      for (const [index, projectId] of result.projectIds.entries()) {
        const binding = result.checkpointSet?.find((row) => row.projectId === projectId);
        if (!binding) throw new Error("Missing checkpoint binding");
        expect(binding.reviewedFingerprint).toBe(
          review.checkpointSet?.find((gate) => gate.runIndex === index)?.fingerprint,
        );
        expect(listCheckpoints(h.deps.db, projectId, binding.revisionId)).toMatchObject([
          { stage: "video", state: "held", fingerprint: binding.fingerprint },
        ]);
      }
      h.reopen();
      expect(must(await startPlayDraft(h.deps, input))).toEqual({ ...result, replayed: true });
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM attempts").get()?.n).toBe(0);
      expect(h.deps.db.prepare("SELECT count(*) AS n FROM play_start_receipts").get()?.n).toBe(1);
    } finally {
      h.close();
    }
  },
);

it("refuses changed checkpoint choices under an old review without creating projects", async () => {
  const h = startFixture();
  try {
    const id = randomUUID();
    must(createDraft(h.deps, { id, document: h.document }));
    const review = must(await reviewDraft(h.deps, { id, baseVersion: 1 }));
    must(
      saveDraft(h.deps, {
        id,
        baseVersion: 1,
        mutationId: randomUUID(),
        document: { ...h.document, form: { ...h.document.form, checkpoints: ["audio"] } },
      }),
    );
    expect(
      await startPlayDraft(h.deps, { draftId: id, baseVersion: 1, reviewId: review.id }),
    ).toMatchObject({ ok: false, reason: "stale-review" });
    expect(h.deps.db.prepare("SELECT count(*) AS n FROM projects").get()?.n).toBe(0);
  } finally {
    h.close();
  }
});
