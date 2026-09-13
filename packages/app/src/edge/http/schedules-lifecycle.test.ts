import { randomUUID } from "node:crypto";
import { Hono } from "hono";
import { expect, it } from "vitest";
import { startFixture } from "../../slices/play-drafts/draft.fake.js";
import { templateById } from "../../slices/project-templates/repo.js";
import { createTemplate, deleteTemplate } from "../../slices/project-templates/service.js";
import { scheduleById } from "../../slices/schedules/repo.js";
import { createScheduleRunner } from "../../slices/schedules/scheduler.js";
import {
  cancelSchedule,
  createSchedule,
  deleteSchedule,
  listScheduleRuns,
  listSchedules,
  pauseSchedule,
  resumeSchedule,
  updateSchedule,
} from "../../slices/schedules/service.js";
import { projectTemplateRoutes } from "./project-templates.js";
import { scheduleRoutes } from "./schedules.js";

function fixture() {
  const h = startFixture();
  const templateId = randomUUID();
  const template = createTemplate(h.deps, { id: templateId, name: "Saved", document: h.document });
  if (!template.ok) throw new Error(template.reason);
  const deps = {
    ...h.deps,
    template: (id: string, version: number) => templateById(h.deps.db, id, version),
  };
  const input = {
    id: randomUUID(),
    name: "Once",
    templateId,
    templateVersion: 1,
    cadence: { kind: "once", at: "2026-09-12T00:01:00.000Z" },
    timezone: "UTC",
    missedPolicy: "skip",
    overlapPolicy: "skip",
    spendLimitCents: null,
    items: [],
  } as const;
  const created = createSchedule(deps, input);
  if (!created.ok) throw new Error(created.reason);
  return { ...h, deps, templateId, schedule: created.value, scheduleInput: input };
}

it("requires cancellation before deleting active or paused schedules", () => {
  const h = fixture();
  try {
    expect(deleteSchedule(h.deps, { id: h.schedule.id, baseVersion: 1 })).toEqual({
      ok: false,
      reason: "cancel-required",
    });
    const paused = pauseSchedule(h.deps, { id: h.schedule.id, baseVersion: 1 });
    if (!paused.ok) throw new Error(paused.reason);
    expect(
      deleteSchedule(h.deps, { id: h.schedule.id, baseVersion: paused.value.version }),
    ).toEqual({
      ok: false,
      reason: "cancel-required",
    });
    const canceled = cancelSchedule(h.deps, {
      id: h.schedule.id,
      baseVersion: paused.value.version,
    });
    expect(canceled).toMatchObject({ ok: true, value: { status: "canceled", nextRunAt: null } });
    if (!canceled.ok) throw new Error(canceled.reason);
    expect(
      deleteSchedule(h.deps, { id: h.schedule.id, baseVersion: canceled.value.version }),
    ).toEqual({
      ok: true,
      value: { deleted: true },
    });
  } finally {
    h.close();
  }
});

it("tombstones a completed schedule and serves its retained history from normal detail", async () => {
  const h = fixture();
  try {
    await createScheduleRunner(h.deps).tick(new Date("2026-09-12T00:03:00Z"));
    const completed = scheduleById(h.deps.db, h.schedule.id);
    if (!completed) throw new Error("Missing completed schedule");
    const before = h.deps.db
      .prepare("SELECT * FROM schedule_runs WHERE schedule_id=?")
      .all(completed.id);
    expect(before).toHaveLength(1);
    expect(deleteSchedule(h.deps, { id: completed.id, baseVersion: completed.version }).ok).toBe(
      true,
    );
    const tombstone = scheduleById(h.deps.db, completed.id);
    expect(tombstone).toMatchObject({
      id: completed.id,
      status: "completed",
      nextRunAt: null,
      deletedAt: expect.any(String),
    });
    expect(listSchedules(h.deps)).toContainEqual(tombstone);
    expect(
      h.deps.db.prepare("SELECT * FROM schedule_runs WHERE schedule_id=?").all(completed.id),
    ).toEqual(before);
    expect(listScheduleRuns(h.deps, completed.id)).toMatchObject({
      ok: true,
      value: [{ status: "skipped" }],
    });
    const app = new Hono().route("/schedules", scheduleRoutes(h.deps));
    const listed = await app.request("/schedules");
    expect(await listed.json()).toMatchObject({
      schedules: [{ id: completed.id, deletedAt: expect.any(String) }],
    });
    const history = await app.request(`/schedules/${completed.id}`);
    expect(history.status).toBe(200);
    expect(await history.json()).toMatchObject({
      schedule: { id: completed.id, deletedAt: expect.any(String) },
      runs: [{ status: "skipped", scheduleId: completed.id }],
    });
    expect((await app.request(`/schedules/${completed.id}/runs`)).status).toBe(404);
  } finally {
    h.close();
  }
});

it("rejects tombstone reuse and mutations while replaying delete safely", () => {
  const h = fixture();
  try {
    const canceled = cancelSchedule(h.deps, { id: h.schedule.id, baseVersion: 1 });
    if (!canceled.ok) throw new Error(canceled.reason);
    const first = deleteSchedule(h.deps, {
      id: h.schedule.id,
      baseVersion: canceled.value.version,
    });
    expect(first).toEqual({ ok: true, value: { deleted: true } });
    const deleted = scheduleById(h.deps.db, h.schedule.id);
    if (!deleted) throw new Error("Missing schedule tombstone");
    expect(deleted.deletedAt).not.toBeNull();

    const beforeReplay = deleted;
    expect(
      deleteSchedule(h.deps, { id: h.schedule.id, baseVersion: canceled.value.version }),
    ).toEqual(first);
    expect(scheduleById(h.deps.db, h.schedule.id)).toEqual(beforeReplay);
    expect(createSchedule(h.deps, h.scheduleInput)).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(
      updateSchedule(h.deps, {
        ...h.scheduleInput,
        baseVersion: deleted.version,
        mutationId: randomUUID(),
      }),
    ).toEqual({ ok: false, reason: "conflict" });
    expect(pauseSchedule(h.deps, { id: h.schedule.id, baseVersion: deleted.version })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(resumeSchedule(h.deps, { id: h.schedule.id, baseVersion: deleted.version })).toEqual({
      ok: false,
      reason: "conflict",
    });
    expect(cancelSchedule(h.deps, { id: h.schedule.id, baseVersion: deleted.version })).toEqual({
      ok: false,
      reason: "conflict",
    });
  } finally {
    h.close();
  }
});

it("returns actionable conflict when any schedule references a template", async () => {
  const h = fixture();
  try {
    const input = { id: h.templateId, baseVersion: 1 };
    expect(() => deleteTemplate(h.deps, input)).not.toThrow();
    expect(deleteTemplate(h.deps, input)).toEqual({ ok: false, reason: "referenced-by-schedule" });
    const app = new Hono().route("/templates", projectTemplateRoutes(h.deps));
    const response = await app.request(`/templates/${h.templateId}`, {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ baseVersion: 1 }),
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      reason: "referenced-by-schedule",
      detail: expect.stringContaining("schedule"),
    });
    const canceled = cancelSchedule(h.deps, { id: h.schedule.id, baseVersion: 1 });
    if (!canceled.ok) throw new Error(canceled.reason);
    expect(deleteTemplate(h.deps, input)).toEqual({ ok: false, reason: "referenced-by-schedule" });
    expect(
      deleteSchedule(h.deps, { id: h.schedule.id, baseVersion: canceled.value.version }).ok,
    ).toBe(true);
    expect(deleteTemplate(h.deps, input)).toEqual({ ok: true, value: { deleted: true } });
  } finally {
    h.close();
  }
});
