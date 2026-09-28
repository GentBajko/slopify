import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import type { ScheduleCreate } from "./model.js";
import { createScheduleRunner } from "./scheduler.js";
import { scheduleCreateSchema } from "./schema.js";
import { createSchedule, pauseSchedule, resumeSchedule, updateSchedule } from "./service.js";

function scheduleInput(
  templateId: ScheduleCreate["templateId"],
  id = randomUUID() as ScheduleCreate["id"],
) {
  return {
    id,
    name: "Daily supplied article",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily" as const, time: "00:01" },
    timezone: "UTC",
    missedPolicy: "skip" as const,
    overlapPolicy: "skip" as const,
    spendLimitCents: null,
    items: [{ title: "Arda", values: {} }],
  };
}

it("rejects scheduled keyword names with surrounding whitespace", () => {
  expect(
    scheduleCreateSchema.safeParse({
      ...scheduleInput(randomUUID()),
      items: [{ title: "Arda", values: { " topic": "Arda" } }],
    }).success,
  ).toBe(false);
});

it("creates, pauses, resumes and updates a schedule with a timezone preview", () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    const createdTemplate = createTemplate(h.deps, {
      id: templateId,
      name: "Supplied article",
      document: h.document,
    });
    expect(createdTemplate.ok).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const created = createSchedule(deps, scheduleInput(templateId));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.nextRunAt).toBe("2026-09-12T00:01:00.000Z");
    const paused = pauseSchedule(deps, {
      id: created.value.id,
      baseVersion: created.value.version,
    });
    expect(paused.ok && paused.value.status).toBe("paused");
    if (!paused.ok) return;
    const resumed = resumeSchedule(deps, {
      id: created.value.id,
      baseVersion: paused.value.version,
    });
    expect(resumed.ok && resumed.value.status).toBe("active");
    if (!resumed.ok) return;
    const updated = updateSchedule(deps, {
      ...scheduleInput(templateId, created.value.id),
      baseVersion: resumed.value.version,
      mutationId: randomUUID(),
      name: "Updated schedule",
    });
    expect(updated.ok && updated.value.name).toBe("Updated schedule");
  } finally {
    h.close();
  }
});

it("refuses a template whose shorts use supplied background music, and accepts it with Shorts off", () => {
  const h = startFixture();
  try {
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const shorts = {
      enabled: true,
      count: "2",
      minSeconds: "45",
      maxSeconds: "90",
      prompt: "",
      imagePrompt: "",
    };
    const withMusic = (enabled: boolean) => ({
      ...h.document,
      form: {
        ...h.document.form,
        shorts: { ...shorts, enabled },
        provided: {
          ...h.document.form.provided,
          shortsMusic: { attachmentId: randomUUID(), name: "bed.mp3" },
        },
      },
    });
    const on = randomUUID();
    expect(createTemplate(h.deps, { id: on, name: "Music", document: withMusic(true) }).ok).toBe(
      true,
    );
    expect(createSchedule(deps, scheduleInput(on))).toEqual({
      ok: false,
      reason: "unsupported-media",
    });
    const off = randomUUID();
    expect(createTemplate(h.deps, { id: off, name: "Silent", document: withMusic(false) }).ok).toBe(
      true,
    );
    expect(createSchedule(deps, scheduleInput(off)).ok).toBe(true);
  } finally {
    h.close();
  }
});

it("replays a committed update when its response was lost", () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, {
        id: templateId,
        name: "Supplied article",
        document: h.document,
      }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const created = createSchedule(deps, scheduleInput(templateId));
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const request = {
      ...scheduleInput(templateId, created.value.id),
      baseVersion: created.value.version,
      mutationId: randomUUID(),
      name: "Saved despite lost response",
    };

    const first = updateSchedule(deps, request);
    const replay = updateSchedule(deps, request);

    expect(first.ok && first.value.version).toBe(2);
    expect(replay).toEqual(first);
  } finally {
    h.close();
  }
});

it("claims a due one-off schedule once and records the started project", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID();
    expect(
      createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const input = {
      ...scheduleInput(templateId),
      cadence: { kind: "once" as const, at: "2026-09-12T00:01:00.000Z" },
    };
    const created = createSchedule(deps, input);
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const scheduler = createScheduleRunner(deps);
    await scheduler.tick(new Date("2026-09-12T00:02:00.000Z"));
    const row = h.deps.db
      .prepare("SELECT status,next_run_at FROM schedules WHERE id=?")
      .get(created.value.id);
    expect(row).toEqual({ status: "completed", next_run_at: null });
    const run = h.deps.db
      .prepare("SELECT status,request_id FROM schedule_runs WHERE schedule_id=?")
      .get(created.value.id);
    expect(run).toMatchObject({ status: "succeeded", request_id: expect.any(String) });
    // One run starts one project, from the first queued topic.
    expect(h.events).toHaveLength(1);
    await scheduler.tick(new Date("2026-09-12T00:03:00.000Z"));
    expect(
      h.deps.db
        .prepare("SELECT count(*) AS n FROM schedule_runs WHERE schedule_id=?")
        .get(created.value.id),
    ).toEqual({ n: 1 });
  } finally {
    h.close();
  }
});

it("records a missed occurrence without dispatching when skip is selected", async () => {
  const h = startFixture();
  try {
    const templateId = randomUUID() as ScheduleCreate["templateId"];
    expect(
      createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document }).ok,
    ).toBe(true);
    const deps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
    };
    const created = createSchedule(deps, {
      ...scheduleInput(templateId),
      cadence: { kind: "once" as const, at: "2026-09-12T00:01:00.000Z" },
      missedPolicy: "skip",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    await createScheduleRunner(deps).tick(new Date("2026-09-12T00:03:00.000Z"));
    expect(
      h.deps.db
        .prepare("SELECT status,error FROM schedule_runs WHERE schedule_id=?")
        .get(created.value.id),
    ).toEqual({
      status: "skipped",
      error: "Skipped because Slopify was not running at the scheduled time.",
    });
    expect(h.events).toEqual([]);
  } finally {
    h.close();
  }
});
