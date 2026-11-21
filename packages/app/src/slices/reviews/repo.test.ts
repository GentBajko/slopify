import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ReviewRecord } from "./model.js";
import {
  actOnVerdict,
  latestVerdict,
  pendingRedos,
  reviewedSameFile,
  saveVerdict,
  setRedoState,
} from "./repo.js";
import { latestReviews } from "./view.js";

const db = openDb(":memory:");
migrate(db, fixedClock("2026-09-27T10:00:00.000Z"));
db.prepare("INSERT INTO projects VALUES (?,?,?,?,?,?)").run("p1", "T", "16:9", "{}", "now", "now");
afterEach(() => db.exec("DELETE FROM review_verdicts"));

const failed: ReviewRecord = {
  id: "v1",
  projectId: "p1",
  revisionId: "r1",
  itemKey: "image:hill",
  stage: "images",
  itemFingerprint: "out-1",
  reviewFingerprint: "rev-1",
  passed: false,
  reasons: ["Stray letters in the sky."],
  outcome: "flagged",
  attempt: 1,
  action: null,
  actionAt: null,
  redoState: null,
  redoError: null,
  answeredBy: "model",
  actionBy: null,
  createdAt: "2026-09-27T10:00:00.000Z",
};

describe("review verdicts", () => {
  it("saves a verdict with its reasons and lets the person overrule it", () => {
    saveVerdict(db, failed);
    const result = actOnVerdict(db, "p1", "v1", "overruled", "2026-09-27T11:00:00.000Z");
    expect(result).toMatchObject({
      ok: true,
      value: { action: "overruled", actionAt: "2026-09-27T11:00:00.000Z", reasons: failed.reasons },
    });
    expect(latestVerdict(db, "p1", "image:hill")?.action).toBe("overruled");
  });

  it("refuses to overrule a pass, a missing verdict, or one already being made again", () => {
    saveVerdict(db, { ...failed, passed: true, reasons: [], outcome: "passed" });
    expect(actOnVerdict(db, "p1", "v1", "overruled", "t")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(actOnVerdict(db, "p1", "nope", "overruled", "t")).toEqual({
      ok: false,
      reason: "not-found",
    });
    saveVerdict(db, {
      ...failed,
      id: "v2",
      reviewFingerprint: "rev-2",
      outcome: "redo",
      redoState: "started",
    });
    expect(actOnVerdict(db, "p1", "v2", "overruled", "t")).toEqual({
      ok: false,
      reason: "conflict",
    });
    setRedoState(db, "v2", "failed", "Provider not ready.");
    expect(actOnVerdict(db, "p1", "v2", "overruled", "t").ok).toBe(true);
  });

  it("calls off a redo still waiting to start when the person overrules it", () => {
    saveVerdict(db, { ...failed, outcome: "redo", redoState: "pending" });
    expect(pendingRedos(db, "p1").map((row) => row.id)).toEqual(["v1"]);
    expect(actOnVerdict(db, "p1", "v1", "redone", "t")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(actOnVerdict(db, "p1", "v1", "overruled", "t")).toMatchObject({
      ok: true,
      value: { action: "overruled", redoState: null },
    });
    expect(pendingRedos(db)).toEqual([]);
  });

  it("keeps one verdict per review step and marks which ones are about the current output", () => {
    saveVerdict(db, failed);
    saveVerdict(db, { ...failed, id: "again", passed: true, reasons: [], outcome: "passed" });
    const rows = db.prepare("SELECT id, passed FROM review_verdicts").all();
    expect(rows).toEqual([{ id: "v1", passed: 1 }]);
    saveVerdict(db, {
      ...failed,
      id: "v3",
      reviewFingerprint: "rev-3",
      itemFingerprint: "out-2",
      createdAt: "2026-09-27T12:00:00.000Z",
    });
    const records = [latestVerdict(db, "p1", "image:hill")].flatMap((row) => (row ? [row] : []));
    expect(
      latestReviews(records, [{ workKey: "image:hill", fingerprint: "out-2", outputId: "o2" }]),
    ).toMatchObject([{ id: "v3", current: true }]);
    expect(
      latestReviews(records, [{ workKey: "image:hill", fingerprint: "out-1", outputId: "o1" }])[0]
        ?.current,
    ).toBe(false);
  });
  it("refuses a second decision on a verdict that already has one", () => {
    saveVerdict(db, failed);
    expect(actOnVerdict(db, "p1", "v1", "overruled", "t1")).toMatchObject({ ok: true });
    expect(actOnVerdict(db, "p1", "v1", "overruled", "t2")).toMatchObject({
      ok: false,
      reason: "decided",
    });
    expect(actOnVerdict(db, "p1", "v1", "redone", "t3")).toMatchObject({
      ok: false,
      reason: "decided",
    });
    expect(latestVerdict(db, "p1", "image:hill")?.actionAt).toBe("t1");
  });
});

describe("the file a verdict looked at", () => {
  const revision = (id: string, parent: string | null) =>
    db
      .prepare(
        "INSERT INTO project_revisions(id,project_id,parent_id,config,content,fingerprints,created_at) VALUES (?,?,?,?,?,?,?)",
      )
      .run(id, "p1", parent, "{}", "{}", "{}", "now");
  const output = (id: string, revisionId: string, assetId: string, fingerprint: string) =>
    db
      .prepare(
        "INSERT INTO revision_outputs(id,project_id,revision_id,slot,work_key,asset_id,fingerprint,state,descriptor,selected,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id,
        "p1",
        revisionId,
        "article:article_md",
        "article:body",
        assetId,
        fingerprint,
        "ready",
        "{}",
        1,
        "now",
      );
  revision("rv1", null);
  revision("rv2", "rv1");
  for (const asset of ["a-kept", "a-new"])
    db.prepare("INSERT INTO project_assets VALUES (?,?,?,?,?)").run(
      asset,
      "p1",
      `${asset}.md`,
      1,
      "now",
    );
  output("o1", "rv1", "a-kept", "fp-settling");
  output("o2", "rv2", "a-kept", "fp-planned");
  const verdict = {
    ...failed,
    revisionId: "rv1",
    itemKey: "article:body",
    stage: "article" as const,
    itemFingerprint: "fp-settling",
  };

  it("knows the same file under the fingerprint a later version stamped it with", () => {
    expect(reviewedSameFile(db, verdict, "rv2", "fp-planned")).toBe(true);
    // The promise check looks at the article too.
    expect(reviewedSameFile(db, { ...verdict, itemKey: "promise" }, "rv2", "fp-planned")).toBe(
      true,
    );
  });

  it("tells a rewritten article apart", () => {
    revision("rv3", "rv2");
    output("o3", "rv3", "a-new", "fp-rewritten");
    expect(reviewedSameFile(db, verdict, "rv3", "fp-rewritten")).toBe(false);
    expect(reviewedSameFile(db, verdict, "rv2", "fp-unknown")).toBe(false);
  });
});
