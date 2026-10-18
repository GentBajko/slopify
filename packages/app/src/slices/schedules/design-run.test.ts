import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { designCatalogue, pngOf } from "../designs/designs.fake.js";
import { poster } from "../designs/document.fake.js";
import { createDesignRunner } from "../designs/runner.js";
import type { DesignDocument } from "../designs/schema.js";
import { createTemplate as createDesignTemplate, markTemplateReady } from "../designs/templates.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import {
  notReadySentence,
  runnableTemplate,
  templateGate,
} from "../template-studio/schedule-gate.js";
import { calendarRange } from "./agenda.js";
import type { ScheduleDeps } from "./model.js";
import { refreshDesignSchedules } from "./next-run.js";
import { prepareTopic } from "./prepare.js";
import { scheduleById } from "./repo.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule, listScheduleRuns, listSchedules, updateSchedule } from "./service.js";

const dated = (overrides: Partial<DesignDocument> = {}) =>
  poster({ schedule: { dateField: "Date", daysBefore: 7, time: "09:00" }, ...overrides });
const row = (title: string, date: string) => ({
  title,
  values: { Event: title, Date: date, Venue: "The Cellar", Price: "€12" },
});

let cleanup: (() => void) | undefined;
afterEach(() => cleanup?.());

async function setup(options: { ready?: boolean; doc?: DesignDocument } = {}) {
  const h = startFixture();
  cleanup = () => h.deps.db.close();
  const asked: string[] = [];
  const service = { ...h.deps, emit: () => {} };
  const runner = createDesignRunner({
    ...service,
    catalogue: () => designCatalogue,
    generate: async (request) => {
      asked.push(request.prompt);
      return { bytes: pngOf(1080, 1920), mime: "image/png" };
    },
  });
  const made = createDesignTemplate(service, {
    id: "gig-poster",
    mutationId: "mutation-0001",
    name: "Gig poster",
    document: options.doc ?? dated(),
  });
  if (!made.ok) throw new Error(made.message);
  if (options.ready !== false) await markTemplateReady(service, "gig-poster", { version: 1 });
  const deps: ScheduleDeps = {
    ...h.deps,
    uuid: randomUUID,
    template: (id: string) => templateById(h.deps.db, id),
    designs: () => ({ service, runner, catalogue: () => designCatalogue }),
  };
  const id = randomUUID();
  const create = (extra: Record<string, unknown> = {}) =>
    createSchedule(deps, {
      id,
      name: "Gig posters",
      templateKind: "design",
      templateId: "gig-poster",
      templateVersion: 1,
      cadence: { kind: "by-date", time: "09:00" },
      timezone: "UTC",
      items: [row("Late Set", "2026-11-14"), row("Early Set", "2026-12-05")],
      ...extra,
    });
  const runs = () => {
    const result = listScheduleRuns(deps, id);
    return result.ok ? result.value : [];
  };
  return { h, deps, id, create, runs, asked, runner, service };
}

describe("a design schedule", () => {
  it("makes each row's piece ahead of its date, removes the row and records the design", async () => {
    const { h, deps, id, create, runs, asked, runner } = await setup();
    const created = create();
    expect(created.ok && created.value).toMatchObject({
      templateKind: "design",
      nextRunAt: "2026-11-07T09:00:00.000Z",
    });
    const ticks = createScheduleRunner(deps);
    await ticks.tick(new Date("2026-11-07T09:00:30.000Z"));
    await runner.idle();
    const [run] = runs();
    expect(run).toMatchObject({ status: "succeeded", projectIds: [], error: null });
    expect(run?.designIds).toHaveLength(1);
    const design = h.deps.db
      .prepare("SELECT name, schedule_id, schedule_run_id, sample_of, values_json FROM designs")
      .get();
    expect(design).toEqual({
      name: "Late Set",
      schedule_id: id,
      schedule_run_id: run?.id,
      sample_of: null,
      values_json: JSON.stringify(row("Late Set", "2026-11-14").values),
    });
    expect(asked).toHaveLength(1);
    const after = scheduleById(h.deps.db, id);
    expect(after?.items.map((item) => item.title)).toEqual(["Early Set"]);
    expect(after?.nextRunAt).toBe("2026-11-28T09:00:00.000Z");
    expect(after?.status).toBe("active");
  });

  // `main.ts` hands every schedule the template studio's gate; it is a project template's, so a
  // design schedule never waits for a project template's Mark ready.
  it("runs with the template studio's gate wired in, which only project templates have", async () => {
    const { h, deps, id, create, runs, runner } = await setup();
    const wired: ScheduleDeps = {
      ...deps,
      template: (templateId) => runnableTemplate(h.deps.db, templateId),
      notReady: (templateId) => notReadySentence(h.deps.db, templateId),
      templateGate: (templateId) => templateGate(h.deps.db, templateId),
      templateHead: (templateId) => templateById(h.deps.db, templateId),
    };
    expect(create().ok).toBe(true);
    expect(listSchedules(wired).find((one) => one.id === id)?.templateGate).toBeUndefined();
    const range = calendarRange(
      wired,
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-12-31T00:00:00.000Z"),
    );
    expect(range.ok && range.value.runs.map((run) => [run.templateKind, run.notReady])).toEqual([
      ["design", false],
      ["design", false],
    ]);
    await createScheduleRunner(wired).tick(new Date("2026-11-07T09:00:30.000Z"));
    await runner.idle();
    expect(runs().map((run) => [run.status, run.error, run.designIds.length])).toEqual([
      ["succeeded", null, 1],
    ]);
  });

  it("stays active with nothing to run once its table is empty, and runs rows added later", async () => {
    const { h, deps, id, create } = await setup();
    create({ items: [row("Late Set", "2026-11-14")] });
    await createScheduleRunner(deps).tick(new Date("2026-11-07T09:00:30.000Z"));
    const empty = scheduleById(h.deps.db, id);
    expect([empty?.status, empty?.nextRunAt, empty?.items]).toEqual(["active", null, []]);
    const updated = updateSchedule(deps, {
      id,
      name: "Gig posters",
      templateKind: "design",
      templateId: "gig-poster",
      templateVersion: 1,
      cadence: { kind: "by-date", time: "09:00" },
      timezone: "UTC",
      items: [row("New Year", "2026-12-31")],
      baseVersion: empty?.version,
      mutationId: randomUUID(),
    });
    expect(updated.ok && updated.value.nextRunAt).toBe("2026-12-24T09:00:00.000Z");
  });

  it("skips a row whose date is over and says so", async () => {
    const { h, deps, id, create, runs, asked } = await setup();
    create({ items: [row("Late Set", "2026-11-14")] });
    await createScheduleRunner(deps).tick(new Date("2026-11-20T09:00:00.000Z"));
    expect(runs().map((run) => [run.status, run.error])).toEqual([
      ["skipped", "Skipped: Late Set on 2026-11-14 is already over."],
    ]);
    expect(scheduleById(h.deps.db, id)?.items).toEqual([]);
    expect(asked).toHaveLength(0);
  });

  it("makes nothing from a template with no version marked ready, and tries again once one is", async () => {
    const { h, deps, id, create, runs, asked, service } = await setup({ ready: false });
    create();
    const ticks = createScheduleRunner(deps);
    await ticks.tick(new Date("2026-11-07T09:00:30.000Z"));
    expect(runs().map((run) => [run.status, run.error])).toEqual([
      [
        "skipped",
        "Not started: Gig poster has no version marked ready. Open it in Library → Designs → Templates and press Mark ready.",
      ],
    ]);
    expect(scheduleById(h.deps.db, id)?.items).toHaveLength(2);
    expect(scheduleById(h.deps.db, id)?.nextRunAt).toBe("2026-11-08T09:00:00.000Z");
    await markTemplateReady(service, "gig-poster", { version: 1 });
    expect(
      refreshDesignSchedules(h.deps.db, "gig-poster", new Date("2026-11-07T10:00:00.000Z")),
    ).toBe(1);
    expect(scheduleById(h.deps.db, id)?.nextRunAt).toBe("2026-11-07T10:00:00.000Z");
    await ticks.tick(new Date("2026-11-07T10:00:00.000Z"));
    expect(asked).toHaveLength(1);
  });

  it("keeps a row over the spend limit and says how to start it", async () => {
    const { h, deps, id, create, runs, asked } = await setup();
    create({ spendLimitCents: 1 });
    await createScheduleRunner(deps).tick(new Date("2026-11-07T09:00:30.000Z"));
    expect(runs()[0]).toMatchObject({
      status: "failed",
      error:
        "Not started: Late Set's piece costs up to $0.04, over this schedule's spend limit. Raise the spend limit or choose an image model with a known, lower price.",
    });
    expect(scheduleById(h.deps.db, id)?.items).toHaveLength(2);
    expect(asked).toHaveLength(0);
  });

  it("keeps a row whose field the template version needs is empty", async () => {
    const { h, deps, id, create, runs } = await setup();
    create();
    h.deps.db
      .prepare("UPDATE schedules SET items_json=? WHERE id=?")
      .run(JSON.stringify([{ title: "Late Set", values: { Date: "2026-11-14" } }]), id);
    await createScheduleRunner(deps).tick(new Date("2026-11-07T09:00:30.000Z"));
    expect(runs()[0]?.error).toBe(
      "Not started: Late Set has no {{Event}}, {{Venue}}, {{Price}} in its row. Fill them in under Schedules → Gig posters; the next try is at 09:00.",
    );
  });

  it("is refused without dates, with topic generation, or for a template without a date field", async () => {
    const { create } = await setup();
    const undated = create({ items: [{ title: "Late Set", values: { Event: "Late Set" } }] });
    expect(undated.ok ? "saved" : undated.message).toBe(
      "The schedule wasn't saved. Row 1 (Late Set) has no date in {{Date}}. Write it as YYYY-MM-DD, for example 2026-11-14.",
    );
    const daily = create({ cadence: { kind: "daily", time: "09:00" } });
    expect(daily.ok ? "saved" : daily.reason).toBe("invalid-input");
    const topics = create({ topicGeneration: { mode: "queue", keepAtLeast: 5, llm: null } });
    expect(topics.ok ? "saved" : topics.reason).toBe("invalid-input");
    const unknown = create({
      items: [{ title: "x", values: { Date: "2026-11-14", Colour: "red" } }],
    });
    expect(unknown.ok ? "saved" : unknown.message).toContain(
      "fills {{Colour}}, which this template doesn't use",
    );
    const gone = create({ templateId: "nope" });
    expect(gone.ok ? "saved" : gone.reason).toBe("missing-template");
  });

  it("can't be switched to making videos", async () => {
    const { h, deps, id, create } = await setup();
    create();
    const saved = scheduleById(h.deps.db, id);
    const switched = updateSchedule(deps, {
      id,
      name: "Gig posters",
      templateKind: "project",
      templateId: randomUUID(),
      templateVersion: 1,
      cadence: { kind: "daily", time: "09:00" },
      timezone: "UTC",
      baseVersion: saved?.version,
      mutationId: randomUUID(),
    });
    expect(switched.ok ? "saved" : switched.message).toBe(
      "A schedule can't switch between making videos and making designed pieces. Make a new schedule for the other kind.",
    );
  });

  it("asks for a date field on a template that has none", async () => {
    const { create } = await setup({ doc: poster() });
    const result = create();
    expect(result.ok ? "saved" : result.message).toContain(
      "Gig poster doesn't say which field holds each date.",
    );
  });

  it("shows each row on the calendar on the day its piece is made", async () => {
    const { deps, create } = await setup();
    create();
    const calendar = calendarRange(
      deps,
      new Date("2026-11-01T00:00:00.000Z"),
      new Date("2026-12-01T00:00:00.000Z"),
    );
    expect(
      calendar.ok &&
        calendar.value.runs.map((run) => [run.at, run.topic, run.templateName, run.templateKind]),
    ).toEqual([
      ["2026-11-07T09:00:00.000Z", "Late Set", "Gig poster", "design"],
      ["2026-11-28T09:00:00.000Z", "Early Set", "Gig poster", "design"],
    ]);
  });

  it("has nothing to prepare ahead, and says so instead of a deleted template", async () => {
    const { deps, id, create } = await setup();
    create();
    expect(await prepareTopic(deps, { scheduleId: id, title: "Late Set" })).toEqual({
      ok: false,
      reason: "design",
    });
  });
});
