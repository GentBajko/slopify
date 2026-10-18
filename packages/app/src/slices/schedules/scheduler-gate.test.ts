import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate, updateTemplate } from "../project-templates/service.js";
import { writeGate } from "../template-studio/repo.js";
import {
  notReadySentence,
  runnableTemplate,
  templateGate,
} from "../template-studio/schedule-gate.js";
import { calendarRange } from "./agenda.js";
import type { ScheduleDeps } from "./model.js";
import { prepareTopic } from "./prepare.js";
import { createScheduleRunner } from "./scheduler.js";
import { createSchedule, listSchedules } from "./service.js";

// A schedule runs the newest version of its template that was saved before the studio, marked
// ready, or carried over by Slopify; a newer unchecked one waits, and a template with none
// skips its runs, saying how to fix it. Wired as `main.ts` wires it.

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function setup() {
  const h = startFixture();
  open.push(h.close);
  const templateId = randomUUID();
  const scheduleId = randomUUID();
  const document = {
    ...h.document,
    form: { ...h.document.form, title: "First cut: {{Topic}}", values: { Topic: "x" } },
  };
  if (!createTemplate(h.deps, { id: templateId, name: "Lighthouses", document }).ok)
    throw new Error("template");
  const deps: ScheduleDeps = {
    ...h.deps,
    template: (id) => runnableTemplate(h.deps.db, id),
    notReady: (id) => notReadySentence(h.deps.db, id),
    templateGate: (id) => templateGate(h.deps.db, id),
    templateHead: (id) => templateById(h.deps.db, id),
  };
  const schedule = () => {
    const made = createSchedule(deps, {
      id: scheduleId,
      name: "Nightly",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "00:01" },
      timezone: "UTC",
      items: [
        { title: "Pyramids", values: {} },
        { title: "Obelisks", values: {} },
      ],
      topicKeyword: "Topic",
    });
    if (!made.ok) throw new Error(made.reason);
  };
  const edit = (baseVersion: number, title: string) => {
    const saved = updateTemplate(h.deps, {
      id: templateId,
      baseVersion,
      mutationId: randomUUID(),
      name: "Lighthouses",
      document: { ...document, form: { ...document.form, title } },
    });
    if (!saved.ok) throw new Error(saved.reason);
    return saved.value.version;
  };
  const runs = () =>
    h.deps.db
      .prepare("SELECT status,error FROM schedule_runs WHERE schedule_id=? ORDER BY scheduled_for")
      .all(scheduleId);
  const titles = () =>
    h.events.map((id) => h.deps.db.prepare("SELECT title FROM projects WHERE id=?").get(id)?.title);
  const queue = () =>
    JSON.parse(
      String(
        h.deps.db.prepare("SELECT items_json FROM schedules WHERE id=?").get(scheduleId)
          ?.items_json,
      ),
    ) as { title: string }[];
  return { h, deps, templateId, scheduleId, schedule, edit, runs, titles, queue };
}

const tick = new Date("2026-09-12T00:01:30.000Z");

describe("a schedule's template version", () => {
  it("runs a template saved before the studio exactly as before (legacy)", async () => {
    const { h, deps, templateId, schedule, runs, titles } = setup();
    writeGate(h.deps.db, templateId, { version: 1, state: "legacy", carriedFrom: null });
    schedule();
    await createScheduleRunner(deps).tick(tick);
    expect(runs()).toEqual([{ status: "succeeded", error: null }]);
    expect(titles()).toEqual(["First cut: Pyramids"]);
  });

  it("keeps a legacy template's schedule runnable on its legacy version after an unchecked edit", async () => {
    const { h, deps, templateId, schedule, edit, runs, titles } = setup();
    writeGate(h.deps.db, templateId, { version: 1, state: "legacy", carriedFrom: null });
    schedule();
    edit(1, "Second cut: {{Topic}}");
    await createScheduleRunner(deps).tick(tick);
    expect(runs()).toEqual([{ status: "succeeded", error: null }]);
    expect(titles()).toEqual(["First cut: Pyramids"]);
  });

  it("runs the ready version while a newer one isn't marked ready, and the newer one once it is", async () => {
    const { h, deps, templateId, schedule, edit, runs, titles } = setup();
    writeGate(h.deps.db, templateId, { version: 1, state: "ready", carriedFrom: null });
    schedule();
    const next = edit(1, "Second cut: {{Topic}}");
    const runner = createScheduleRunner(deps);
    await runner.tick(tick);
    expect(titles()).toEqual(["First cut: Pyramids"]);
    writeGate(h.deps.db, templateId, { version: next, state: "ready", carriedFrom: null });
    // The first run's project is done (the fixture supplies everything), so the next runs.
    await runner.tick(new Date("2026-09-13T00:01:30.000Z"));
    expect(runs()).toEqual([
      { status: "succeeded", error: null },
      { status: "succeeded", error: null },
    ]);
    expect(titles()).toEqual(["First cut: Pyramids", "Second cut: Obelisks"]);
  });

  it("skips a run, spending nothing and keeping the topic, when no version is ready", async () => {
    const { h, deps, schedule, runs, queue, scheduleId } = setup();
    schedule();
    await createScheduleRunner(deps).tick(tick);
    expect(h.events).toEqual([]);
    expect(runs()).toEqual([
      {
        status: "skipped",
        error:
          "Not started: Lighthouses has no version marked ready. Open it in Library → Templates → Open studio and press Mark ready.",
      },
    ]);
    expect(queue().map((item) => item.title)).toEqual(["Pyramids", "Obelisks"]);
    // The schedule itself keeps going: the next day's run starts once a version is ready.
    expect(listSchedules(deps).find((one) => one.id === scheduleId)?.status).toBe("active");
  });

  it("says on each schedule which version runs and whether a newer one waits", () => {
    const { h, deps, templateId, schedule, edit, scheduleId } = setup();
    schedule();
    const of = () => listSchedules(deps).find((one) => one.id === scheduleId)?.templateGate;
    expect(of()).toEqual({ head: 1, runs: null, gate: "unchecked" });
    writeGate(h.deps.db, templateId, { version: 1, state: "legacy", carriedFrom: null });
    expect(of()).toEqual({ head: 1, runs: 1, gate: "legacy" });
    edit(1, "Second cut: {{Topic}}");
    expect(of()).toEqual({ head: 2, runs: 1, gate: "legacy" });
  });

  it("refuses to prepare a topic ahead while no version is ready, saying how to fix it", async () => {
    const { h, deps, schedule, scheduleId } = setup();
    schedule();
    expect(await prepareTopic(deps, { scheduleId, title: "Pyramids" })).toEqual({
      ok: false,
      reason: "not-ready",
      detail:
        "Not started: Lighthouses has no version marked ready. Open it in Library → Templates → Open studio and press Mark ready.",
    });
    expect(h.events).toEqual([]);
  });

  it("takes a topic keyword the newest version adds before it is marked ready", () => {
    const { h, deps, templateId, edit } = setup();
    writeGate(h.deps.db, templateId, { version: 1, state: "ready", carriedFrom: null });
    // Version 1's title has {{Topic}}; version 2 adds {{Era}}.
    edit(1, "Second cut: {{Topic}} in {{Era}}");
    const made = createSchedule(deps, {
      id: randomUUID(),
      name: "Eras",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "00:01" },
      timezone: "UTC",
      items: [{ title: "Bronze", values: {} }],
      topicKeyword: "Era",
    });
    expect(made.ok).toBe(true);
    const refused = createSchedule(deps, {
      id: randomUUID(),
      name: "Nope",
      templateId,
      templateVersion: 1,
      cadence: { kind: "daily", time: "00:01" },
      timezone: "UTC",
      items: [],
      topicKeyword: "Colour",
    });
    expect(refused).toMatchObject({ ok: false, reason: "invalid-topics" });
  });

  it("marks a calendar run that waits for a ready version, and not one that has it", () => {
    const { h, deps, templateId, schedule } = setup();
    schedule();
    const from = h.deps.clock.now();
    const to = new Date(from.valueOf() + 2 * 24 * 60 * 60 * 1000);
    const runs = () => {
      const range = calendarRange(deps, from, to);
      if (!range.ok) throw new Error(range.reason);
      return range.value.runs;
    };
    expect(runs().map((run) => run.notReady)).toEqual([true, true]);
    writeGate(h.deps.db, templateId, { version: 1, state: "ready", carriedFrom: null });
    expect(runs().map((run) => run.notReady)).toEqual([false, false]);
  });
});
