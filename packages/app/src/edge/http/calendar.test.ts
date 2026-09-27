import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { createTemplate } from "../../slices/project-templates/service.js";
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
    template: (id, version) => templateById(h.deps.db, id, version),
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
  return { h, deps, schedule, project };
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
