import { expect, it } from "vitest";
import { revisionFixture } from "../slices/revisions/revision.fake.js";
import { scheduledSoonMs, workInProgress } from "./work-in-progress.js";

const now = Date.parse("2026-09-29T10:00:00.000Z");

it("names the job an update waits for, and nothing once all is idle", () => {
  const h = revisionFixture();
  try {
    const { db } = h.deps;
    const title = String(
      db.prepare("SELECT title FROM projects WHERE id=?").get(h.projectId)?.title,
    );
    const idle = () => workInProgress(db, () => false, now);
    expect(idle()).toBeUndefined();
    // A step running in the runner.
    expect(workInProgress(db, (id) => id === h.projectId, now)).toBe(title);
    // A batch with videos still to make.
    db.prepare("INSERT INTO batches(id,created_at) VALUES ('b','2026-09-29')").run();
    db.prepare("INSERT INTO project_queue(project_id,batch_id,state) VALUES (?,'b','queued')").run(
      h.projectId,
    );
    expect(idle()).toBe(title);
    db.prepare("UPDATE project_queue SET state='finished'").run();
    expect(idle()).toBeUndefined();
    // A narration chunk about to be recorded again.
    db.prepare(
      "INSERT INTO narration_retries(project_id,chunk_key,tries,state,updated_at) VALUES (?,'audio:body:a-1',1,'pending','x')",
    ).run(h.projectId);
    expect(idle()).toBe(title);
    db.prepare("UPDATE narration_retries SET state='started'").run();
    expect(idle()).toBeUndefined();
    // A schedule due soon, but not one due later.
    const at = (ms: number) => new Date(now + ms).toISOString();
    db.prepare(
      `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,status,version,creation_hash,next_run_at,created_at,updated_at)
       VALUES ('s','Weekly lore','t',1,'{}','UTC','skip','skip','[]','active',1,'h',?, 'x','x')`,
    ).run(at(scheduledSoonMs + 60_000));
    expect(idle()).toBeUndefined();
    db.prepare("UPDATE schedules SET next_run_at=?").run(at(scheduledSoonMs - 60_000));
    expect(idle()).toBe("Weekly lore");
    db.prepare("UPDATE schedules SET status='paused'").run();
    expect(idle()).toBeUndefined();
  } finally {
    h.close();
  }
});
