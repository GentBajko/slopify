import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import { nextOccurrence } from "./calendar.js";
import type { ScheduleDeps } from "./model.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule } from "./service.js";

// Design schedules must leave project schedules exactly as they were: the same summary, the
// same next run from `nextOccurrence`, and the same runs, whether designs are wired or not.

async function scenario(withDesigns: boolean) {
  const h = startFixture();
  try {
    const templateId = "00000000-0000-4000-8000-0000000000aa";
    createTemplate(h.deps, { id: templateId, name: "Supplied", document: h.document });
    const deps: ScheduleDeps = {
      ...h.deps,
      template: (id: string) => templateById(h.deps.db, id),
      ...(withDesigns ? { designs: () => undefined } : {}),
    };
    const created = createSchedule(deps, {
      id: "00000000-0000-4000-8000-0000000000bb",
      name: "Daily batch",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "00:01" },
      timezone: "UTC",
      items: [
        { title: "First topic", values: {} },
        { title: "Second topic", values: {} },
      ],
    });
    if (!created.ok) throw new Error(created.reason);
    const runner = createScheduleRunner(deps);
    await runner.tick(new Date("2026-09-12T00:01:30.000Z"));
    await runner.tick(new Date("2026-09-13T00:01:30.000Z"));
    const schedule = h.deps.db
      .prepare("SELECT template_kind, items_json, status, next_run_at, version FROM schedules")
      .get();
    const runs = h.deps.db
      .prepare(
        "SELECT scheduled_for, status, error, json_array_length(project_ids_json) AS projects, design_ids_json FROM schedule_runs ORDER BY scheduled_for",
      )
      .all();
    return { created: created.value, schedule, runs, deps };
  } finally {
    h.deps.db.close();
  }
}

it("leaves a project schedule exactly as it was before design schedules", async () => {
  const without = await scenario(false);
  const withDesigns = await scenario(true);
  expect(withDesigns.schedule).toEqual(without.schedule);
  expect(withDesigns.runs).toEqual(without.runs);
  expect(without.created.templateKind).toBe("project");
  expect(without.created.nextRunAt).toBe(
    nextOccurrence(
      { kind: "daily", time: "00:01" },
      "UTC",
      new Date(without.created.createdAt),
    )?.toISOString(),
  );
  expect(without.schedule).toMatchObject({ template_kind: "project" });
  expect(without.runs).toEqual([
    {
      scheduled_for: "2026-09-12T00:01:00.000Z",
      status: "succeeded",
      error: null,
      projects: 1,
      design_ids_json: "[]",
    },
    {
      scheduled_for: "2026-09-13T00:01:00.000Z",
      status: "succeeded",
      error: null,
      projects: 1,
      design_ids_json: "[]",
    },
  ]);
});

it("still refuses a project schedule with a template id that isn't a UUID, or one run by date", () => {
  const h = startFixture();
  try {
    const deps: ScheduleDeps = { ...h.deps, template: (id: string) => templateById(h.deps.db, id) };
    const base = {
      id: randomUUID(),
      name: "Daily",
      templateId: randomUUID(),
      templateVersion: 1,
      cadence: { kind: "daily", time: "09:00" },
      timezone: "UTC",
    };
    const named = createSchedule(deps, { ...base, templateId: "gig-poster" });
    expect(named.ok ? "saved" : named.reason).toBe("invalid-input");
    const byDate = createSchedule(deps, { ...base, cadence: { kind: "by-date", time: "09:00" } });
    expect(byDate.ok ? "saved" : byDate.reason).toBe("invalid-input");
    const missing = createSchedule(deps, base);
    expect(missing.ok ? "saved" : missing.reason).toBe("missing-template");
  } finally {
    h.deps.db.close();
  }
});
