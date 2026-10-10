import { config, emptyView } from "../rebuild/recipe-fixture.js";
import { insertRevision } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { type ExternalReview, openExternalReview } from "./external.js";

// Project p1 whose current version reserves one image review that waits for an agent.
export function waitingReviewFixture(): {
  readonly h: ReturnType<typeof revisionFixture>;
  readonly revisionId: string;
  readonly review: ExternalReview;
  readonly close: () => void;
} {
  const h = revisionFixture();
  const { db } = h.deps;
  const view = emptyView(config);
  insertRevision(db, view.revision);
  db.prepare("INSERT INTO project_heads VALUES (?,?)").run(h.projectId, view.revision.id);
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('images',?,'images','generate','pending')",
  ).run(h.projectId);
  db.prepare(
    "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('images-work',?,?,'images','images',?,'pending','allowed',?)",
  ).run(h.projectId, view.revision.id, "a".repeat(64), h.deps.clock.now().toISOString());
  db.prepare(
    `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state) VALUES ('review-piece','images-work','review:image:one','req','review-fp','{"kind":"local"}','pending','allowed')`,
  ).run();
  db.prepare(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES (?,?,'review:image:one','images-work','review-piece','review-fp')",
  ).run(h.projectId, view.revision.id);
  const review = openExternalReview(db, {
    id: "er1",
    projectId: h.projectId,
    revisionId: view.revision.id,
    workId: "images-work",
    pieceId: "review-piece",
    workKey: "review:image:one",
    itemKey: "image:one",
    stage: "images",
    itemFingerprint: "item-fp",
    reviewFingerprint: "review-fp",
    material: {
      request: {
        stage: "images",
        instruction: "Check the hands.",
        sections: [{ label: "Brief the image was drawn from", text: "A lighthouse at dusk." }],
        images: ["the image to review"],
      },
      images: [],
    },
    waitingSince: "2026-09-10T00:00:00.000Z",
    deadlineAt: "2026-09-10T02:00:00.000Z",
  });
  return { h, revisionId: view.revision.id, review, close: h.close };
}
