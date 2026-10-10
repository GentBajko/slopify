import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "../reviews/external.fake.js";
import { agentReviewHold } from "./runtime-agent-review.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

const work = (revisionId: string) => ({
  projectId: "p1",
  revisionId,
  workId: "images-work",
  stageId: "images",
  kind: "images" as const,
  fingerprint: "a".repeat(64),
});

it("holds a stage whose only unfinished steps wait for an agent", () => {
  const f = waitingReviewFixture();
  open.push(f);
  expect(agentReviewHold(f.h.deps, work(f.revisionId))).toEqual({
    kind: "held",
    checkpointIds: ["agent-review:er1"],
  });
});

it("lets the stage run while it has other work, and once the review is answered", () => {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare(
    `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,state,dispatch_state) VALUES ('image-piece','images-work','image:two','req2','fp2','{"kind":"local"}','pending','allowed')`,
  ).run();
  expect(agentReviewHold(f.h.deps, work(f.revisionId))).toEqual({ kind: "eligible" });
  db.prepare("DELETE FROM revision_work_pieces WHERE id='image-piece'").run();
  db.prepare("UPDATE external_reviews SET state='answered' WHERE id='er1'").run();
  expect(agentReviewHold(f.h.deps, work(f.revisionId))).toEqual({ kind: "eligible" });
});
