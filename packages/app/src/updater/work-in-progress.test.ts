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

it("says a hidden template sample is the studio's, not a project of the person's", () => {
  const h = revisionFixture();
  try {
    const { db } = h.deps;
    db.prepare(
      "INSERT INTO project_templates(id,head_version,creation_hash,created_at) VALUES ('t',1,'h','x')",
    ).run();
    db.prepare(
      "INSERT INTO project_template_revisions(template_id,version,name,document_json,created_at) VALUES ('t',1,'Weekly history','{}','x')",
    ).run();
    db.prepare(
      "INSERT INTO template_samples(template_id,project_id,topic,topic_source,created_at) VALUES ('t',?,'Rome','fixed','x')",
    ).run(h.projectId);
    expect(workInProgress(db, (id) => id === h.projectId, now)).toBe(
      "the studio sample of Weekly history",
    );
  } finally {
    h.close();
  }
});

it("waits for a picture being made, a design template's sample and live work", () => {
  const h = revisionFixture();
  try {
    const { db } = h.deps;
    const idle = (live?: () => string | undefined) => workInProgress(db, () => false, now, live);
    expect(idle()).toBeUndefined();
    db.prepare(
      "INSERT INTO designs(id,kind,name,channel_id,created_at,updated_at) VALUES ('d','design','Gig poster','c','x','x')",
    ).run();
    db.prepare(
      "INSERT INTO design_steps(id,design_id,n,kind,state,created_at) VALUES ('s1','d',1,'generate','making','x')",
    ).run();
    expect(idle()).toBe("Gig poster");
    db.prepare("UPDATE design_steps SET state='failed'").run();
    expect(idle()).toBeUndefined();
    db.prepare(
      "INSERT INTO design_templates(id,head_version,created_at) VALUES ('dt',1,'x')",
    ).run();
    db.prepare(
      "INSERT INTO design_template_revisions(template_id,version,name,document_json,created_at) VALUES ('dt',1,'Flyer','{}','x')",
    ).run();
    db.prepare("UPDATE designs SET sample_of='dt'").run();
    db.prepare("UPDATE design_steps SET state='making'").run();
    expect(idle()).toBe("the studio sample of Flyer");
    db.prepare("DELETE FROM design_steps").run();
    db.prepare(
      "INSERT INTO design_template_samples(template_id,design_id,version,state,updated_at) VALUES ('dt','d',1,'making','x')",
    ).run();
    expect(idle()).toBe("the studio sample of Flyer");
    db.prepare("UPDATE design_template_samples SET state='done'").run();
    expect(idle()).toBeUndefined();
    expect(idle(() => "the model checks")).toBe("the model checks");
  } finally {
    h.close();
  }
});
