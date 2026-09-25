import { afterEach, expect, it } from "vitest";
import { transact } from "../../kernel/db/tx.js";
import { maySubmit, publicationTargets, transitionRevisionWork } from "./repo.js";
import { workFixture } from "./work.fake.js";
import { workPieces } from "./work-records.js";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const close of cleanups.splice(0)) close();
});
async function fixture() {
  const h = await workFixture();
  cleanups.push(h.close);
  return h;
}
it.each(["narration:files:body", "narration:prepare:intro:future"])(
  "restores %s as held Audio work when exact recipes are absent",
  async (key) => {
    const { deps, work, nextRevision } = await fixture();
    deps.db.exec(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES('audio','p1','audio','generate','pending')",
    );
    const fingerprints = { [key]: "restored" };
    nextRevision("next", fingerprints);
    transitionRevisionWork(deps, {
      projectId: "p1",
      baseRevisionId: work.revisionId,
      revisionId: "next",
      fingerprints,
    });
    expect(
      deps.db
        .prepare("SELECT kind,state,dispatch_state FROM revision_work WHERE revision_id='next'")
        .all(),
    ).toEqual([{ kind: "audio", state: "pending", dispatch_state: "held" }]);
    expect(deps.db.prepare("SELECT count(*) AS n FROM attempts").get()).toEqual({ n: 0 });
  },
);
it.each([false, true])(
  "carries exact unchanged reservations before/after head CAS (%s)",
  async (after) => {
    const { deps, work, nextRevision } = await fixture();
    nextRevision("next", { "image:i1": "old" });
    if (after) deps.db.exec("UPDATE project_heads SET revision_id='next'");
    transitionRevisionWork(deps, {
      projectId: "p1",
      baseRevisionId: work.revisionId,
      revisionId: "next",
      fingerprints: { "image:i1": "old" },
    });
    expect(maySubmit(deps.db, work, "piece1")).toBe(true);
    expect(
      deps.db
        .prepare("SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id='next'")
        .get(),
    ).toEqual({ work_id: "w1", piece_id: "piece1" });
    if (!after) deps.db.exec("UPDATE project_heads SET revision_id='next'");
    expect(
      publicationTargets(
        deps.db,
        { work, pieceId: "piece1", publicationId: "piece1" },
        "image:i1",
        "old",
      ),
    ).toContainEqual({ revisionId: "next", current: true, selected: true });
  },
);
it.each([null, "submitted"])(
  "holds changed unsent work and drains submitted work (%s)",
  async (submitted) => {
    const { deps, work, nextRevision } = await fixture();
    deps.db.prepare("UPDATE revision_work_pieces SET submitted_at=?").run(submitted);
    nextRevision("next", { "image:i1": "new" });
    transitionRevisionWork(deps, {
      projectId: "p1",
      baseRevisionId: work.revisionId,
      revisionId: "next",
      fingerprints: { "image:i1": "new" },
    });
    expect(maySubmit(deps.db, work, "piece1")).toBe(false);
    expect(workPieces(deps.db, work.workId)[0]?.dispatchState).toBe(
      submitted === null ? "held" : "draining",
    );
    const reservation = deps.db
      .prepare("SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id='next'")
      .get();
    expect(reservation?.work_id).not.toBe(work.workId);
    const pieces = workPieces(deps.db, String(reservation?.work_id));
    expect(pieces[0]).toMatchObject({
      state: "held",
      dispatchState: "held",
      continuation: null,
      generationToken: null,
      input: { kind: "deferred" },
    });
    expect(
      publicationTargets(
        deps.db,
        { work, pieceId: "piece1", publicationId: "piece1" },
        "image:i1",
        "old",
      ),
    ).toEqual([{ revisionId: work.revisionId, current: true, selected: false }]);
  },
);
it("rolls back new work and revocations with the owning Save transaction", async () => {
  const { deps, work, nextRevision } = await fixture();
  nextRevision("next", { "image:i1": "new" });
  const before = deps.db.prepare("SELECT * FROM revision_work_reservations").all();
  expect(() =>
    transact(deps.db, () => {
      transitionRevisionWork(deps, {
        projectId: "p1",
        baseRevisionId: work.revisionId,
        revisionId: "next",
        fingerprints: { "image:i1": "new" },
      });
      throw new Error("save failed");
    }),
  ).toThrow("save failed");
  expect(deps.db.prepare("SELECT * FROM revision_work_reservations").all()).toEqual(before);
  expect(maySubmit(deps.db, work, "piece1")).toBe(true);
  expect(deps.db.prepare("SELECT count(*) AS n FROM revision_work").get()?.n).toBe(1);
});
it("stores exact local recipe inputs and independent publication pieces", async () => {
  const { deps, work, nextRevision } = await fixture();
  deps.db.exec(
    "INSERT INTO stages(id,project_id,kind,source,state) VALUES('audio','p1','audio','generate','pending')",
  );
  nextRevision("next", { "audio:body:concat": "body", "audio:intro:concat": "intro" });
  const recipes = ["body", "intro"].map((segment) => ({
    key: `audio:${segment}:concat`,
    stage: "audio" as const,
    kind: "local" as const,
    fingerprint: segment,
    requestFingerprint: `request-${segment}`,
    logicalFingerprint: segment,
    input: {
      kind: "local" as const,
      version: 1 as const,
      operation: "concat-narration" as const,
      values: [segment],
    },
    deferred: false,
    unresolved: false,
    dependsOn: [],
  }));
  transitionRevisionWork(deps, {
    projectId: "p1",
    baseRevisionId: work.revisionId,
    revisionId: "next",
    fingerprints: { "audio:body:concat": "body", "audio:intro:concat": "intro" },
    recipes,
  });
  const refs = deps.db
    .prepare("SELECT work_id,piece_id FROM revision_work_reservations WHERE revision_id='next'")
    .all();
  expect(new Set(refs.map((row) => row.piece_id)).size).toBe(2);
  for (const ref of refs)
    expect(workPieces(deps.db, String(ref.work_id))[0]?.input.kind).toBe("local");
});
it("does not borrow historical release authority when restoring earlier content", async () => {
  const { deps, work, nextRevision } = await fixture();
  nextRevision("current", { "image:i1": "different" });
  nextRevision("restored", { "image:i1": "old" });
  deps.db.exec("UPDATE project_heads SET revision_id='current'");
  transitionRevisionWork(deps, {
    projectId: "p1",
    baseRevisionId: "current",
    revisionId: "restored",
    fingerprints: { "image:i1": "old" },
  });
  const ref = deps.db
    .prepare("SELECT work_id FROM revision_work_reservations WHERE revision_id='restored'")
    .get();
  expect(ref?.work_id).not.toBe(work.workId);
  expect(workPieces(deps.db, String(ref?.work_id))[0]?.dispatchState).toBe("held");
});
it.each(["split narration", "resolved thinking"])(
  "carries %s using logical inputs without rewriting physical requests",
  async (mode) => {
    const { deps, work, nextRevision } = await fixture();
    const logicalKey = mode === "split narration" ? "audio:body:1" : "article";
    const physicalKeys =
      mode === "split narration" ? ["audio:body:1", "audio:body:2", "audio:body:3"] : ["article"];
    deps.db.exec("DELETE FROM revision_work_reservations");
    for (const [index, key] of physicalKeys.entries()) {
      const pieceId = `physical-${index}`;
      deps.db
        .prepare(
          `INSERT INTO revision_work_pieces(id,work_id,work_key,request_fingerprint,fingerprint,input_json,continuation,generation_token,state,dispatch_state,submitted_at) SELECT ?,work_id,?,'actual-request',?,input_json,'accepted',generation_token,state,dispatch_state,'before' FROM revision_work_pieces WHERE id='piece1'`,
        )
        .run(pieceId, key, `actual-${index}`);
      deps.db
        .prepare(
          `INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) VALUES ('p1',?,?,?,?,?)`,
        )
        .run(work.revisionId, key, work.workId, pieceId, `actual-${index}`);
    }
    nextRevision("next", { [logicalKey]: "logical" });
    transitionRevisionWork(deps, {
      projectId: "p1",
      baseRevisionId: work.revisionId,
      revisionId: "next",
      fingerprints: { [logicalKey]: "logical" },
      baseFingerprints: { [logicalKey]: "logical" },
      logicalKeys: Object.fromEntries(physicalKeys.map((key) => [key, logicalKey])),
    });
    deps.db.exec("UPDATE project_heads SET revision_id='next'");
    for (const [index, key] of physicalKeys.entries()) {
      const pieceId = `physical-${index}`;
      expect(maySubmit(deps.db, work, pieceId)).toBe(true);
      expect(
        publicationTargets(
          deps.db,
          { work, pieceId, publicationId: pieceId },
          key,
          `actual-${index}`,
        ),
      ).toContainEqual({ revisionId: "next", current: true, selected: true });
      expect(workPieces(deps.db, work.workId).find((piece) => piece.id === pieceId)).toMatchObject({
        requestFingerprint: "actual-request",
        continuation: "accepted",
        fingerprint: `actual-${index}`,
      });
    }
  },
);
it("refuses a stale base rather than revoking the current head work", async () => {
  const { deps, work, nextRevision } = await fixture();
  nextRevision("current", { "image:i1": "old" });
  nextRevision("next", { "image:i1": "old" });
  deps.db.exec("UPDATE project_heads SET revision_id='current'");
  deps.db.exec(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,piece_id,fingerprint) SELECT project_id,'current',work_key,work_id,piece_id,fingerprint FROM revision_work_reservations",
  );
  expect(() =>
    transitionRevisionWork(deps, {
      projectId: "p1",
      baseRevisionId: work.revisionId,
      revisionId: "next",
      fingerprints: { "image:i1": "old" },
    }),
  ).toThrow("current head");
  expect(maySubmit(deps.db, work, "piece1")).toBe(true);
});
