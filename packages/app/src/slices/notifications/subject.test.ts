import { afterEach, describe, expect, it } from "vitest";
import { waitingReviewFixture } from "../reviews/external-repo.fake.js";
import { createRunNotifier } from "./notifier.js";
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

// The day's hold and a checkpoint of the person's both hold the run: it is not merely prepared,
// so Waiting for you goes out for the person's review.
it("says Waiting for you when a checkpoint of the person's holds the run beside the day's", () => {
  const f = prepared();
  const { db } = f.h.deps;
  db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  db.prepare(
    "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'audio-gate','audio','images-work',?,'held','2026-09-10T00:02:00.000Z')",
  ).run(f.revisionId, "c".repeat(64));
  expect(noticeSubject(db, "p1")?.atItsDay).toBe(false);
});

// A step failed beside the run's wait is told right away (`runNotices`), once per failure:
// the subject says so, and which failure it is.
it("says which step failed while the run still waits on its day's hold", () => {
  const f = prepared();
  const { db } = f.h.deps;
  db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  expect(noticeSubject(db, "p1")).not.toHaveProperty("stepFailed");
  expect(noticeSubject(db, "p1")).not.toHaveProperty("failures");
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state,finished_at) VALUES ('thumbnail','p1','thumbnail','generate','failed','2026-09-10T00:05:00.000Z')",
  ).run();
  expect(noticeSubject(db, "p1")).toMatchObject({
    stepFailed: true,
    failures: [{ id: "thumbnail@2026-09-10T00:05:00.000Z", kind: "thumbnail" }],
  });
});

// An uploaded project with nothing left to run reads Done on the list (`settledStatus`): no step
// of it fails beside a wait, so the notices say none did either.
it("says no step failed beside a wait for an uploaded project that reads Done", () => {
  const f = prepared();
  const { db } = f.h.deps;
  db.prepare("UPDATE stages SET state='done' WHERE kind='images'").run();
  db.prepare(
    "INSERT INTO stages(id,project_id,kind,source,state,finished_at) VALUES ('thumbnail','p1','thumbnail','generate','failed','2026-09-10T00:05:00.000Z')",
  ).run();
  db.prepare("UPDATE revision_work SET state='done'").run();
  db.prepare(
    "INSERT INTO project_uploads(project_id,uploaded_at) VALUES ('p1','2026-09-10T00:06:00.000Z')",
  ).run();
  expect(noticeSubject(db, "p1")).not.toHaveProperty("stepFailed");
});

// The person's decisions (2026-10-10, 2026-10-11), as the Notification URL hears them from the
// project's own rows: a step that fails while another waits at the person's checkpoint is told
// right away though a third still runs; with nothing waiting, nothing is said until the run ends.
describe("Step failed on the Notification URL", () => {
  async function narrationFails(atCheckpoint: boolean): Promise<readonly string[]> {
    const f = waitingReviewFixture();
    open.push(f);
    const { db } = f.h.deps;
    db.prepare("UPDATE external_reviews SET state='answered'").run();
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state) VALUES ('article','p1','article','generate','done'), ('thumbnail','p1','thumbnail','generate','running')",
    ).run();
    db.prepare(
      "INSERT INTO stages(id,project_id,kind,source,state,finished_at,failure_reason) VALUES ('audio','p1','audio','generate','failed','2026-09-10T00:05:00.000Z','The narration was refused.')",
    ).run();
    if (atCheckpoint)
      db.prepare(
        "INSERT INTO review_checkpoints(project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at) VALUES ('p1',?,'images-gate','images','images-work',?,'held','2026-09-10T00:02:00.000Z')",
      ).run(f.revisionId, "c".repeat(64));
    const sent: string[] = [];
    const notifier = createRunNotifier({
      url: () => "https://ntfy.example/topic",
      subject: (projectId) => noticeSubject(db, projectId),
      send: async (_url, body) => {
        sent.push(body.split("\n")[0] ?? "");
        return { ok: true };
      },
      log: f.h.deps.log,
    });
    notifier.observe({ type: "project.state", projectId: "p1", state: "running" });
    notifier.observe({ type: "stage.state", projectId: "p1", stage: "audio", state: "failed" });
    await notifier.settled();
    return sent;
  }

  it("is told as the step fails beside the person's checkpoint while another step runs", async () => {
    expect(await narrationFails(true)).toEqual(["Step failed: Saved — The narration was refused."]);
  });

  it("is not told mid-run with nothing waiting", async () => {
    expect(await narrationFails(false)).toEqual([]);
  });
});
