import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { projectHolds } from "../reviews/holds.js";
import {
  heldBeforeVideo,
  preparedProject,
  preparedTopics,
  prepareTopic,
  scheduledDocument,
  scheduledTitle,
} from "./prepare.js";
import { scheduleById } from "./repo.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule } from "./service.js";

function scheduled() {
  const h = startFixture();
  const templateId = randomUUID();
  const scheduleId = randomUUID();
  if (!createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok)
    throw new Error("Expected the template.");
  const deps = { ...h.deps, template: (id: string) => templateById(h.deps.db, id) };
  const created = createSchedule(deps, {
    id: scheduleId,
    name: "Lore",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    missedPolicy: "skip",
    overlapPolicy: "skip",
    spendLimitCents: null,
    items: [
      { title: "First topic", values: {} },
      { title: "Second topic", values: {} },
    ],
  });
  if (!created.ok) throw new Error(JSON.stringify(created));
  return { h, deps, scheduleId };
}

const count = (h: ReturnType<typeof startFixture>, sql: string) =>
  Number(h.deps.db.prepare(sql).get()?.n);

it("refuses to prepare a run of a paused schedule, as the calendar's greyed Prepare says", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    deps.db.prepare("UPDATE schedules SET status='paused' WHERE id=?").run(scheduleId);
    expect(await prepareTopic(deps, { scheduleId, title: "First topic" })).toEqual({
      ok: false,
      reason: "paused",
    });
    expect(count(h, "SELECT count(*) AS n FROM projects")).toBe(0);
  } finally {
    h.close();
  }
});

it("prepares a queued topic now, and its scheduled day continues it instead of starting another", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    const prepared = await prepareTopic(deps, { scheduleId, title: "First topic" });
    if (!prepared.ok) throw new Error(prepared.reason);
    expect(count(h, "SELECT count(*) AS n FROM projects")).toBe(1);
    expect(preparedTopics(deps, scheduleId)).toEqual([
      { title: prepared.title, topic: "First topic", projectId: prepared.projectId },
    ]);
    // This setup makes no video, so nothing is held back; the topic stays queued for its day.
    expect(await prepareTopic(deps, { scheduleId, title: "First topic" })).toEqual({
      ok: false,
      reason: "already-prepared",
    });

    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));
    expect(count(h, "SELECT count(*) AS n FROM projects")).toBe(1);
    expect(
      h.deps.db
        .prepare("SELECT status,project_ids_json FROM schedule_runs WHERE schedule_id=?")
        .get(scheduleId),
    ).toEqual({ status: "succeeded", project_ids_json: JSON.stringify([prepared.projectId]) });
    expect(
      JSON.parse(
        String(
          h.deps.db.prepare("SELECT items_json FROM schedules WHERE id=?").get(scheduleId)
            ?.items_json,
        ),
      ),
    ).toEqual([{ title: "Second topic", values: {} }]);
    expect(count(h, "SELECT count(*) AS n FROM prepared_videos")).toBe(0);
  } finally {
    h.close();
  }
});

it("refuses a topic that isn't queued", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    expect(await prepareTopic(deps, { scheduleId, title: "Nowhere" })).toEqual({
      ok: false,
      reason: "not-found",
    });
  } finally {
    h.close();
  }
});

it("holds a video-making setup before its video, and leaves one the template already holds", () => {
  const h = startFixture();
  try {
    const video = {
      ...h.document,
      form: {
        ...h.document.form,
        sources: { ...h.document.form.sources, video: "generate" as const },
      },
    };
    expect(heldBeforeVideo(video)).toMatchObject({
      added: true,
      document: { form: { checkpoints: ["video"] } },
    });
    const own = {
      ...video,
      form: { ...video.form, checkpoints: ["images", "video"] as ("images" | "video")[] },
    };
    expect(heldBeforeVideo(own)).toEqual({ document: own, added: false });
    expect(heldBeforeVideo(h.document)).toEqual({ document: h.document, added: false });
  } finally {
    h.close();
  }
});

it("keeps the title's keywords in a scheduled draft, so its project keeps the pattern", () => {
  const h = startFixture();
  const templateId = randomUUID();
  const document = { ...h.document, form: { ...h.document.form, title: "{{Topic}} | Lore" } };
  if (!createTemplate(h.deps, { id: templateId, name: "Lore", document }).ok)
    throw new Error("Expected the template.");
  const deps = { ...h.deps, template: (id: string) => templateById(h.deps.db, id) };
  const scheduleId = randomUUID();
  const created = createSchedule(deps, {
    id: scheduleId,
    name: "Lore",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily", time: "00:01" },
    timezone: "UTC",
    missedPolicy: "skip",
    overlapPolicy: "skip",
    spendLimitCents: null,
    topicKeyword: "Topic",
    items: [{ title: "Lighthouse", values: {} }],
  });
  if (!created.ok) throw new Error(JSON.stringify(created));
  const schedule = scheduleById(h.deps.db, scheduleId);
  if (schedule === undefined) throw new Error("Expected the schedule.");
  const fresh = scheduledDocument(deps, schedule, schedule.items[0]);
  if (fresh === undefined) throw new Error("Expected the draft.");
  expect(fresh.form.title).toBe("{{Topic}} | Lore");
  expect(fresh.form.values.Topic).toBe("Lighthouse");
  expect(scheduledTitle(fresh)).toBe("Lighthouse | Lore");
});

it("counts a project as prepared only while its schedule's own hold keeps it for its day", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    const prepared = await prepareTopic(deps, { scheduleId, title: "First topic" });
    if (!prepared.ok) throw new Error(prepared.reason);
    h.deps.db.prepare("UPDATE prepared_videos SET added_checkpoint=1").run();
    expect([...projectHolds(h.deps.db).prepared]).toEqual([prepared.projectId]);
    // The template's own Before Video hold is the person's to approve.
    h.deps.db.prepare("UPDATE prepared_videos SET added_checkpoint=0").run();
    expect([...projectHolds(h.deps.db).prepared]).toEqual([]);
  } finally {
    h.close();
  }
});

// A step a restart held stops the run short of its day's hold: it reads Stopped, not Prepared,
// and stays Stopped, with Continue the run offered, once its day takes the hold away.
it("reads a prepared run a restart stopped as Stopped, before its day and on it", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    const prepared = await prepareTopic(deps, { scheduleId, title: "First topic" });
    if (!prepared.ok) throw new Error(prepared.reason);
    const { db } = h.deps;
    db.prepare("UPDATE prepared_videos SET added_checkpoint=1").run();
    db.prepare(
      "UPDATE revision_work SET state='pending',dispatch_state='held' WHERE project_id=?",
    ).run(prepared.projectId);
    db.prepare("UPDATE stages SET state='pending' WHERE project_id=? AND state!='skipped'").run(
      prepared.projectId,
    );
    const holds = () => projectHolds(db, { projectId: prepared.projectId });
    expect([...holds().stopped]).toEqual([prepared.projectId]);
    expect([...holds().prepared]).toEqual([]);
    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));
    expect(count(h, "SELECT count(*) AS n FROM prepared_videos")).toBe(0);
    expect([...holds().stopped]).toEqual([prepared.projectId]);
  } finally {
    h.close();
  }
});

// A template studio sample is made from the template's next queued topic, so its title can be
// the very title a schedule run makes next. The run must never take that hidden project.
it("never continues a running studio sample that has the next queued topic's title", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    const made = await prepareTopic(deps, { scheduleId, title: "First topic" });
    if (!made.ok) throw new Error(made.reason);
    const { db } = h.deps;
    // The project becomes the studio's running sample: hidden, unfinished, same title.
    db.prepare("UPDATE stages SET state='running' WHERE project_id=? AND state!='skipped'").run(
      made.projectId,
    );
    db.prepare("DELETE FROM prepared_videos").run();
    const templateId = String(db.prepare("SELECT template_id FROM schedules").get()?.template_id);
    db.prepare(
      "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,?,'First topic','queued',0,'2026-09-10T00:00:00.000Z')",
    ).run(templateId, made.projectId);
    expect(preparedProject(db, scheduleId, made.title)).toBeUndefined();
    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:01:30.000Z"));
    const run = db.prepare("SELECT project_ids_json FROM schedule_runs").get();
    expect(String(run?.project_ids_json)).not.toContain(made.projectId);
    expect(count(h, "SELECT count(*) AS n FROM projects")).toBe(2);
  } finally {
    h.close();
  }
});

it("never continues a prepared project that has since become a studio sample", async () => {
  const { h, deps, scheduleId } = scheduled();
  try {
    const made = await prepareTopic(deps, { scheduleId, title: "First topic" });
    if (!made.ok) throw new Error(made.reason);
    const { db } = h.deps;
    const templateId = String(db.prepare("SELECT template_id FROM schedules").get()?.template_id);
    db.prepare(
      "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,?,'First topic','queued',0,'2026-09-10T00:00:00.000Z')",
    ).run(templateId, made.projectId);
    expect(preparedProject(db, scheduleId, made.title, false)).toBeUndefined();
  } finally {
    h.close();
  }
});
