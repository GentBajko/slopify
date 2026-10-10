import { afterEach, expect, it } from "vitest";
import { waitingReviewFixture } from "../reviews/external.fake.js";
import { noticeSubject } from "./subject.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const fixture of open.splice(0)) fixture.close();
});

// p1 prepared by a schedule whose own Before Video hold it carries, its image review answered.
function prepared() {
  const f = waitingReviewFixture();
  open.push(f);
  const { db } = f.h.deps;
  db.prepare("UPDATE external_reviews SET state='answered'").run();
  for (const kind of ["article", "audio", "video"])
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES (?,'p1',?,'generate',?)",
    ).run(kind, kind, kind === "video" ? "pending" : "done");
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'video-gate','video','images-work',?,'held','2026-09-10T00:02:00.000Z')",
  ).run(f.revisionId, "c".repeat(64));
  db.prepare(
    "INSERT INTO prepared_videos(project_id,schedule_id,title,added_checkpoint,prepared_at) VALUES ('p1','s1','Saved',1,'2026-09-10T00:00:00.000Z')",
  ).run();
  return f;
}

it("keeps Waiting for you quiet only while the schedule's own hold is what holds the run", () => {
  const f = prepared();
  const { db } = f.h.deps;
  // The images are still to be made: the run is not at its day's hold yet.
  expect(noticeSubject(db, "p1")?.atItsDay).toBe(false);
  db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  db.prepare("UPDATE revision_work SET state='done'").run();
  db.prepare(
    "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('video-work','p1',?,'video','video',?,'pending','allowed','2026-09-10T00:00:00.000Z')",
  ).run(f.revisionId, "v".repeat(64));
  db.prepare(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,fingerprint) VALUES ('p1',?,'export:video','video-work','v')",
  ).run(f.revisionId);
  expect(noticeSubject(db, "p1")?.atItsDay).toBe(true);
  // A step held for Continue the run: it is stopped, and that is the person's to hear.
  db.prepare("UPDATE stages SET state='pending' WHERE kind='audio'").run();
  db.prepare(
    "INSERT INTO revision_work(id,project_id,revision_id,stage_id,kind,fingerprint,state,dispatch_state,created_at) VALUES ('audio-work','p1',?,'audio','audio',?,'pending','held','2026-09-10T00:00:00.000Z')",
  ).run(f.revisionId, "a".repeat(64));
  db.prepare(
    "INSERT INTO revision_work_reservations(project_id,revision_id,work_key,work_id,fingerprint) VALUES ('p1',?,'audio:body','audio-work','a')",
  ).run(f.revisionId);
  expect(noticeSubject(db, "p1")?.atItsDay).toBe(false);
});
