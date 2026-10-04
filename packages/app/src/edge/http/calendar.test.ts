import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { writeSampleRecord } from "../../slices/onboarding/state.js";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { createTemplate, updateTemplate } from "../../slices/project-templates/service.js";
import { calendarRange } from "../../slices/schedules/agenda.js";
import type { ScheduleDeps } from "../../slices/schedules/model.js";
import { calendarSchema, type TopicGeneration } from "../../slices/schedules/schema.js";
import { createSchedule, pauseSchedule } from "../../slices/schedules/service.js";
import { calendarRoutes } from "./schedules.js";

function fixture() {
  const h = startFixture();
  const templateId = randomUUID();
  const template = createTemplate(h.deps, { id: templateId, name: "Lore", document: h.document });
  if (!template.ok) throw new Error(template.reason);
  const deps: ScheduleDeps = {
    ...h.deps,
    template: (id: string) => templateById(h.deps.db, id),
  };
  const schedule = (
    name: string,
    time: string,
    items: readonly string[],
    topicGeneration?: TopicGeneration,
  ) => {
    const created = createSchedule(deps, {
      id: randomUUID(),
      name,
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time },
      timezone: "UTC",
      items: items.map((title) => ({ title, values: {} })),
      ...(topicGeneration === undefined ? {} : { topicGeneration }),
    });
    if (!created.ok) throw new Error(created.reason);
    return created.value;
  };
  const project = (title: string, state: string, finishedAt: string | null) => {
    const id = randomUUID();
    h.deps.db
      .prepare(
        "INSERT INTO projects (id,title,format,config,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      )
      .run(id, title, "16:9", "{}", "2026-09-09T00:00:00.000Z", "2026-09-09T00:00:00.000Z");
    h.deps.db
      .prepare(
        "INSERT INTO stages (id,project_id,kind,source,state,finished_at) VALUES (?,?,?,?,?,?)",
      )
      .run(randomUUID(), id, "article", "generate", state, finishedAt);
    return id;
  };
  return { h, deps, schedule, project, templateId };
}

it("lists every coming run with its topic, and projects and batch items in the range", async () => {
  const f = fixture();
  try {
    const plain = f.schedule("Queue only", "09:00", ["A", "B"]);
    const held = f.schedule("Held", "10:00", ["X"], { mode: "hold", keepAtLeast: 5, llm: null });
    f.h.deps.db
      .prepare(
        `INSERT INTO schedule_topics (id,schedule_id,title,state,rank,created_at)
         VALUES (?,?,'Waiting','held',0,'2026-09-12T00:00:00.000Z')`,
      )
      .run(randomUUID(), held.id);
    const paused = f.schedule("Template", "11:00", []);
    expect(pauseSchedule(f.deps, { id: paused.id, baseVersion: paused.version }).ok).toBe(true);
    f.project("Still going", "running", null);
    f.project("Finished in range", "done", "2026-09-11T05:00:00.000Z");
    f.project("Finished before", "done", "2026-09-10T05:00:00.000Z");
    const waiting = f.project("Batch item", "pending", null);
    f.h.deps.db
      .prepare("INSERT INTO batches (id,created_at) VALUES ('batch-1','2026-09-11T00:00:00.000Z')")
      .run();
    f.h.deps.db
      .prepare("INSERT INTO project_queue (project_id,batch_id) VALUES (?, 'batch-1')")
      .run(waiting);

    const result = calendarRange(
      f.deps,
      new Date("2026-09-11T00:00:00.000Z"),
      new Date("2026-09-15T00:00:00.000Z"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const runs = result.value.runs.map((run) => [
      run.at.slice(5, 16),
      run.scheduleName,
      run.topic,
      run.topicSource,
      run.index,
      run.paused,
    ]);
    expect(runs).toEqual([
      // The queue-only schedule completes after its last topic, so it stops at B.
      ["09-12T09:00", "Queue only", "A", "queued", 0, false],
      ["09-12T10:00", "Held", "X", "queued", 0, false],
      ["09-12T11:00", "Template", null, "template", null, true],
      ["09-13T09:00", "Queue only", "B", "queued", 1, false],
      ["09-13T10:00", "Held", null, "held", null, false],
      ["09-13T11:00", "Template", null, "template", null, true],
      ["09-14T10:00", "Held", null, "generated", null, false],
      ["09-14T11:00", "Template", null, "template", null, true],
    ]);
    expect(result.value.runs[0]?.templateName).toBe("Lore");
    expect(
      result.value.projects
        .map((project) => [project.title, project.state])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
    ).toEqual([
      ["Batch item", "pending"],
      ["Finished in range", "done"],
      ["Still going", "running"],
    ]);
    expect(result.value.queued.map((item) => [item.title, item.state])).toEqual([
      ["Batch item", "queued"],
    ]);
    // A later window starts at the topic the earlier runs leave.
    const later = calendarRange(
      f.deps,
      new Date("2026-09-13T00:00:00.000Z"),
      new Date("2026-09-14T00:00:00.000Z"),
    );
    expect(later.ok && later.value.runs.find((run) => run.scheduleId === plain.id)?.topic).toBe(
      "B",
    );

    const routes = calendarRoutes(f.deps);
    const response = await routes.request(
      "/?from=2026-09-11T00:00:00.000Z&to=2026-09-15T00:00:00.000Z",
    );
    expect(response.status).toBe(200);
    expect(calendarSchema.parse(await response.json()).runs).toHaveLength(8);
    // Four weeks from now when no range is given.
    const fallback = calendarSchema.parse(await (await routes.request("/")).json());
    expect(fallback.to).toBe("2026-10-10T00:00:00.000Z");
  } finally {
    f.h.close();
  }
});

it("says which projects need the person, which are ready to upload and which wait for limits", () => {
  const f = fixture();
  try {
    const db = f.h.deps.db;
    const finished = "2026-09-11T05:00:00.000Z";
    f.project("Broken", "failed", finished);
    const paused = f.project("On hold", "running", null);
    db.prepare("INSERT INTO project_controls (project_id, paused) VALUES (?, 1)").run(paused);
    f.project("Ready", "done", finished);
    const uploaded = f.project("Uploaded", "done", finished);
    db.prepare("INSERT INTO project_uploads (project_id, uploaded_at) VALUES (?, ?)").run(
      uploaded,
      finished,
    );
    const audioOnly = f.project("Audio only", "done", finished);
    db.prepare("UPDATE projects SET config=? WHERE id=?").run(
      JSON.stringify({ sources: { video: "off" } }),
      audioOnly,
    );
    const sample = f.project("Sample", "done", finished);
    writeSampleRecord(db, { projectId: sample, seededAt: finished }, "library");
    // Held at a checkpoint on its current revision, and one with a failed automatic review.
    const held = f.project("Held", "pending", null);
    const flagged = f.project("Flagged", "done", finished);
    db.exec("PRAGMA foreign_keys=OFF");
    for (const id of [held, flagged])
      db.prepare("INSERT INTO project_heads (project_id, revision_id) VALUES (?, ?)").run(
        id,
        `rev-${id}`,
      );
    db.prepare(
      `INSERT INTO review_checkpoints (project_id,revision_id,checkpoint_id,stage,work_id,fingerprint,state,created_at)
       VALUES (?,?,?,'audio','work',?,'held',?)`,
    ).run(held, `rev-${held}`, "cp-1", "a".repeat(64), finished);
    db.prepare(
      `INSERT INTO review_verdicts (id,project_id,revision_id,item_key,stage,item_fingerprint,review_fingerprint,passed,reasons,outcome,attempt,created_at)
       VALUES ('v-1',?,?,'article','article','f','r1',0,'[]','flagged',1,?)`,
    ).run(flagged, `rev-${flagged}`, finished);
    db.exec("PRAGMA foreign_keys=ON");
    const waiting = f.project("Waiting", "running", null);
    db.prepare(
      "INSERT INTO plan_limit_waits (account, resets_at, retry_at, detected_at) VALUES ('codex', ?, ?, ?)",
    ).run("2026-09-12T14:00:00.000Z", "2026-09-12T14:02:00.000Z", finished);
    db.prepare(
      "INSERT INTO plan_limit_waiters (project_id, stage, account, since) VALUES (?, 'article', 'codex', ?)",
    ).run(waiting, finished);

    const result = calendarRange(
      f.deps,
      new Date("2026-09-11T00:00:00.000Z"),
      new Date("2026-09-15T00:00:00.000Z"),
    );
    if (!result.ok) throw new Error("calendar refused");
    const parsed = calendarSchema.parse(result.value);
    const byTitle = new Map(parsed.projects.map((project) => [project.title, project]));
    expect(byTitle.get("Broken")?.needs).toBe("failed");
    expect(byTitle.get("On hold")?.needs).toBe("paused");
    expect(byTitle.get("Held")?.needs).toBe("review");
    expect(byTitle.get("Flagged")?.needs).toBe("review");
    expect(byTitle.get("Ready")?.needs).toBeUndefined();
    expect(
      parsed.projects
        .filter((project) => project.readyToUpload === true)
        .map((project) => project.title)
        .sort(),
    ).toEqual(["Flagged", "Ready"]);
    expect(byTitle.get("Waiting")?.limitWaits).toEqual([
      {
        name: "Codex",
        stage: "article",
        resetsAt: "2026-09-12T14:00:00.000Z",
        retryAt: "2026-09-12T14:02:00.000Z",
      },
    ]);
    expect(byTitle.get("Ready")?.limitWaits).toBeUndefined();
  } finally {
    f.h.close();
  }
});

// Finished projects that ended before the range are left out by the query itself; work still
// going, paused or not started yet stays however old it is.
it("leaves out projects that finished before the range and keeps unfinished ones", () => {
  const f = fixture();
  try {
    const db = f.h.deps.db;
    f.project("Done long ago", "done", "2026-09-09T05:00:00.000Z");
    f.project("Failed long ago", "failed", "2026-09-09T06:00:00.000Z");
    f.project("Still running", "running", null);
    f.project("Not started", "pending", null);
    const paused = f.project("Paused long ago", "done", "2026-09-09T05:00:00.000Z");
    db.prepare("INSERT INTO project_controls (project_id, paused) VALUES (?, 1)").run(paused);
    const broken = f.project("Unreadable settings", "done", "2026-09-12T05:00:00.000Z");
    db.prepare("UPDATE projects SET config='not json' WHERE id=?").run(broken);

    const result = calendarRange(
      f.deps,
      new Date("2026-09-11T00:00:00.000Z"),
      new Date("2026-09-15T00:00:00.000Z"),
    );
    if (!result.ok) throw new Error("calendar refused");
    const byTitle = new Map(result.value.projects.map((project) => [project.title, project]));
    expect([...byTitle.keys()].sort()).toEqual([
      "Not started",
      "Paused long ago",
      "Still running",
      "Unreadable settings",
    ]);
    expect(byTitle.get("Paused long ago")?.needs).toBe("paused");
    // Settings that cannot be read count as a video, as projects saved before sources did.
    expect(byTitle.get("Unreadable settings")?.readyToUpload).toBe(true);
  } finally {
    f.h.close();
  }
});

it("refuses a backwards or overlong range", async () => {
  const f = fixture();
  try {
    expect(
      calendarRange(f.deps, new Date("2026-09-12T00:00:00Z"), new Date("2026-09-11T00:00:00Z")).ok,
    ).toBe(false);
    expect(
      calendarRange(f.deps, new Date("2026-09-12T00:00:00Z"), new Date("2027-01-12T00:00:00Z")).ok,
    ).toBe(false);
    const response = await calendarRoutes(f.deps).request(
      "/?from=2026-09-12T00:00:00.000Z&to=2026-09-11T00:00:00.000Z",
    );
    expect(response.status).toBe(400);
  } finally {
    f.h.close();
  }
});

it("shows and runs the template as it is now, not as it was when the schedule was made", () => {
  const f = fixture();
  try {
    const made = f.schedule("Nightly", "09:00", ["A"]);
    expect(made.templateVersion).toBe(1);
    const renamed = updateTemplate(f.h.deps, {
      id: f.templateId,
      baseVersion: 1,
      mutationId: randomUUID(),
      name: "Lore, renamed",
      document: f.h.document,
    });
    if (!renamed.ok) throw new Error(renamed.reason);
    const result = calendarRange(
      f.deps,
      new Date("2026-09-11T00:00:00.000Z"),
      new Date("2026-09-15T00:00:00.000Z"),
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.runs[0]?.templateName).toBe("Lore, renamed");
  } finally {
    f.h.close();
  }
});
