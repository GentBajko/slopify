import { afterEach, describe, expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import type { ReviewRecord } from "./model.js";
import { actOnVerdict, latestVerdict, pendingRedos, saveVerdict, setRedoState } from "./repo.js";
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

  it("refuses to overrule a pass, a missing verdict, or one being made again", () => {
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
      redoState: "pending",
    });
    expect(actOnVerdict(db, "p1", "v2", "overruled", "t")).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(pendingRedos(db, "p1").map((row) => row.id)).toEqual(["v2"]);
    setRedoState(db, "v2", "failed", "Provider not ready.");
    expect(pendingRedos(db)).toEqual([]);
    expect(actOnVerdict(db, "p1", "v2", "overruled", "t").ok).toBe(true);
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
    expect(latestReviews(records, [{ workKey: "image:hill", fingerprint: "out-2" }])).toMatchObject(
      [{ id: "v3", current: true }],
    );
    expect(
      latestReviews(records, [{ workKey: "image:hill", fingerprint: "out-1" }])[0]?.current,
    ).toBe(false);
  });
});
