import { afterEach, expect, it } from "vitest";
import {
  attemptsOf,
  startWorkAttempt,
  writeWorkContinuation,
} from "../../kernel/runner/attempt-repo.js";
import { workFixture } from "./work.fake.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await workFixture();
  cleanups.push(h.close);
  return h;
}
it("atomically stamps a permitted submission and exposes its complete origin", async () => {
  const { deps, work } = await fixture();
  const result = startWorkAttempt(
    deps.db,
    deps.ids,
    { stageId: work.stageId, pieceId: null, n: 1, startedAt: "now" },
    work,
    "piece1",
  );
  expect(result.ok).toBe(true);
  expect(attemptsOf(deps.db, work.stageId)[0]).toMatchObject({
    revisionId: work.revisionId,
    workId: work.workId,
    workPieceId: "piece1",
  });
  expect(
    deps.db.prepare("SELECT submitted_at FROM revision_work_pieces WHERE id='piece1'").get()
      ?.submitted_at,
  ).toBe("now");
  expect(
    deps.db.prepare("SELECT attempt_count FROM stages WHERE id='s1'").get()?.attempt_count,
  ).toBe(1);
});
it("revoked or mismatched work opens no attempt and stamps nothing", async () => {
  const { deps, work } = await fixture();
  deps.db.exec("UPDATE revision_work_pieces SET dispatch_state='held'");
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 2, startedAt: "now" },
      work,
      "piece1",
    ),
  ).toEqual({ ok: false, reason: "held" });
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 2, startedAt: "now" },
      { ...work, kind: "audio" },
      "piece1",
    ),
  ).toEqual({ ok: false, reason: "held" });
  expect(attemptsOf(deps.db, "s1")).toEqual([]);
  expect(
    deps.db.prepare("SELECT submitted_at FROM revision_work_pieces WHERE id='piece1'").get()
      ?.submitted_at,
  ).toBeNull();
});
it("retains accepted continuations while retrieval cannot stamp paid work or current counts", async () => {
  const { deps, work } = await fixture();
  const input = { stageId: "s1", pieceId: null, n: 1, startedAt: "submitted" };
  startWorkAttempt(deps.db, deps.ids, input, work, "piece1");
  expect(writeWorkContinuation(deps.db, work, "piece1", "operation")).toBe(true);
  deps.db.exec(
    "UPDATE revision_work SET dispatch_state='held'; UPDATE revision_work_pieces SET dispatch_state='draining'",
  );
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { ...input, n: 5, startedAt: "poll" },
      work,
      "piece1",
      "retrieve",
    ),
  ).toMatchObject({ ok: true });
  expect(
    deps.db.prepare("SELECT submitted_at FROM revision_work_pieces WHERE id='piece1'").get()
      ?.submitted_at,
  ).toBe("submitted");
  expect(
    deps.db.prepare("SELECT attempt_count FROM stages WHERE id='s1'").get()?.attempt_count,
  ).toBe(1);
  expect(startWorkAttempt(deps.db, deps.ids, input, work, "piece1")).toEqual({
    ok: false,
    reason: "held",
  });
});
it("rolls back an inserted attempt if its projection fails", async () => {
  const { deps, work } = await fixture();
  deps.db.exec(
    "CREATE TRIGGER reject_count BEFORE UPDATE OF attempt_count ON stages BEGIN SELECT RAISE(ABORT,'test failure'); END",
  );
  expect(() =>
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 1, startedAt: "now" },
      work,
      "piece1",
    ),
  ).toThrow("test failure");
  expect(attemptsOf(deps.db, "s1")).toEqual([]);
  expect(
    deps.db.prepare("SELECT submitted_at FROM revision_work_pieces WHERE id='piece1'").get()
      ?.submitted_at,
  ).toBeNull();
});
it("counts carried old-origin submissions but excludes draining historical retrieval", async () => {
  const { deps, work, nextRevision } = await fixture();
  nextRevision("r-next", { "image:i1": "old" });
  deps.db.exec("UPDATE project_heads SET revision_id='r-next'");
  deps.db.exec(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) SELECT project_id,'r-next',work_key,work_id,piece_id,fingerprint FROM revision_work_reservations",
  );
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 3, startedAt: "now" },
      work,
      "piece1",
    ),
  ).toMatchObject({ ok: true });
  expect(
    deps.db.prepare("SELECT attempt_count FROM stages WHERE id='s1'").get()?.attempt_count,
  ).toBe(3);
});
it("retrieves under the original paid attempt identity without adding billable evidence", async () => {
  const { deps, work } = await fixture();
  const first = startWorkAttempt(
    deps.db,
    deps.ids,
    { stageId: "s1", pieceId: null, n: 1, startedAt: "submitted" },
    work,
    "piece1",
  );
  writeWorkContinuation(deps.db, work, "piece1", "accepted");
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 2, startedAt: "retrieval" },
      work,
      "piece1",
      "retrieve",
    ),
  ).toEqual(first);
  expect(attemptsOf(deps.db, "s1")).toHaveLength(1);
});
it("refuses a still-allowed piece after the same-revision reservation is replaced", async () => {
  const { deps, work } = await fixture();
  deps.db.exec("DELETE FROM revision_work_reservations");
  expect(
    startWorkAttempt(
      deps.db,
      deps.ids,
      { stageId: "s1", pieceId: null, n: 1, startedAt: "now" },
      work,
      "piece1",
    ),
  ).toEqual({ ok: false, reason: "held" });
  expect(attemptsOf(deps.db, "s1")).toEqual([]);
});
it("cannot open a new paid submission after an accepted continuation exists", async () => {
  const { deps, work } = await fixture();
  const input = { stageId: "s1", pieceId: null, n: 1, startedAt: "now" };
  startWorkAttempt(deps.db, deps.ids, input, work, "piece1");
  writeWorkContinuation(deps.db, work, "piece1", "accepted");
  expect(startWorkAttempt(deps.db, deps.ids, { ...input, n: 2 }, work, "piece1")).toEqual({
    ok: false,
    reason: "held",
  });
  expect(attemptsOf(deps.db, "s1")).toHaveLength(1);
});
