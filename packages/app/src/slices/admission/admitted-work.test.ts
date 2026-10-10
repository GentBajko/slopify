import { afterEach, expect, it, vi } from "vitest";
import { derive } from "../../kernel/runner/graph.js";
import { emptyView } from "../rebuild/recipe-fixture.js";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { insertRevision } from "../revisions/repo.js";
import { revisionFixture } from "../revisions/revision.fake.js";
import { admittedStates, parkedKinds } from "./admitted-work.js";
import { stageStandingsByProject, stagesOf } from "./repo.js";

let close: (() => void) | undefined;
afterEach(() => {
  close?.();
  close = undefined;
});

// Every list, calendar and needs_attention read asks of each stage whether its work is admitted
// for the current version: a reservation is found by its step, not by a scan of every
// reservation ever made (seconds on a library of a few dozen projects).
it("finds a step's reservations by their index in every statement that asks", () => {
  const h = revisionFixture();
  close = h.close;
  const prepared = vi.spyOn(h.deps.db, "prepare");
  stageStandingsByProject(h.deps.db);
  stagesOf(h.deps.db, h.projectId);
  admittedStates(h.deps.db, h.projectId);
  parkedKinds(h.deps.db, h.projectId);
  const statements = prepared.mock.calls
    .map(([sql]) => sql)
    .filter((sql) => sql.includes("revision_work_reservations"));
  prepared.mockRestore();
  expect(statements).toHaveLength(4);
  for (const sql of statements) {
    const plan = h.deps.db
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...(sql.includes("?") ? [h.projectId] : []))
      .map((row) => String(row.detail))
      .join("\n");
    expect(plan).not.toMatch(/SCAN r\b/);
    expect(plan).toMatch(/SEARCH r USING (COVERING )?INDEX revision_work_reservations_work/);
  }
});

// p1's images wait (`waitingReviewFixture`) while its narration has failed.
function failedBesideImages() {
  const f = waitingReviewFixture();
  close = f.close;
  const { db } = f.h.deps;
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('audio','p1','audio','generate','failed')",
  ).run();
  const gate = (revisionId: string, workId: string) =>
    db
      .prepare(
        "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,?,'images',?,?,'held','2026-09-10T00:02:00.000Z')",
      )
      .run(revisionId, `gate-${revisionId}`, workId, "c".repeat(64));
  return { f, db, gate, state: () => derive(stagesOf(db, "p1")) };
}

// A checkpoint an older version set holds nothing the current one makes: beside a failed step
// the run reads Failed, not waiting for a review nobody is asked for.
it("reads only the current version's checkpoints as parking a step", () => {
  const { f, db, gate, state } = failedBesideImages();
  insertRevision(db, { ...emptyView().revision, id: "r0" });
  db.prepare(
    "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('old-images-work','p1','r0','images','images',?,'pending','held','2026-09-09T00:00:00.000Z')",
  ).run("b".repeat(64));
  gate("r0", "old-images-work");
  expect(state()).toBe("failed");
  gate(f.revisionId, "images-work");
  expect(state()).toBe("pending");
});

// An agent's review parks its step only while it waits: answered, the step is not parked on it.
it("reads a step parked on an agent's review only while the review waits", () => {
  const { db } = failedBesideImages();
  db.prepare("UPDATE revision_work SET recipe_context='{}' WHERE id='images-work'").run();
  expect([...parkedKinds(db, "p1")]).toEqual(["images"]);
  db.prepare("UPDATE external_reviews SET state='answered'").run();
  expect([...parkedKinds(db, "p1")]).toEqual([]);
});
