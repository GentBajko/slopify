import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { poster } from "../designs/document.fake.js";
import { createTemplate as createDesignTemplate, markTemplateReady } from "../designs/templates.js";
import { startFixture } from "../play-drafts/draft.fake.js";
import { templateById } from "../project-templates/repo.js";
import { createTemplate } from "../project-templates/service.js";
import type { ScheduleDeps } from "../schedules/model.js";
import { createSchedule, pauseSchedule } from "../schedules/service.js";
import { snoozeWarning } from "./repo.js";
import {
  type AutopilotDeps,
  autopilotView,
  clisInUse,
  collectProbes,
  createAutopilotHealth,
} from "./signals.js";

const open: { readonly close: () => void }[] = [];
afterEach(() => {
  for (const one of open.splice(0)) one.close();
});

const log = { write: () => undefined };

// One daily schedule on a template whose text is written by Codex, with two queued topics.
function fixture(queued = 2) {
  const h = startFixture();
  open.push(h);
  const templateId = randomUUID();
  const document = {
    ...h.document,
    form: {
      ...h.document.form,
      title: "{{Topic}}",
      values: { Topic: "" },
      llm: { provider: "codex", model: "gpt" },
    },
  };
  expect(createTemplate(h.deps, { id: templateId, name: "Lighthouses", document }).ok).toBe(true);
  const template = (id: string) => templateById(h.deps.db, id);
  const scheduleDeps: ScheduleDeps = { ...h.deps, template };
  const id = randomUUID();
  const saved = createSchedule(scheduleDeps, {
    id,
    name: "Nightly histories",
    templateId,
    templateVersion: 1,
    cadence: { kind: "daily" as const, time: "09:00" },
    timezone: "UTC",
    items: Array.from({ length: queued }, (_value, at) => ({
      title: `Topic ${String(at + 1)}`,
      values: {},
    })),
    topicKeyword: "Topic",
  });
  expect(saved.ok).toBe(true);
  const deps: AutopilotDeps = { db: h.deps.db, clock: h.deps.clock, log, template };
  return { h, deps, scheduleDeps, scheduleId: id };
}

describe("clisInUse", () => {
  it("asks only the CLIs an active schedule's template uses", () => {
    const f = fixture();
    expect(clisInUse(f.deps.db)).toEqual(["codex"]);
  });
});

describe("collectProbes", () => {
  it("skips a probe that fails or hangs, and never throws", async () => {
    const f = fixture();
    const written: string[] = [];
    const probes = await collectProbes({
      ...f.deps,
      log: { write: (_level, _event, fields) => written.push(String(fields?.detail)) },
      cliLogin: async () => {
        throw new Error("codex is not installed");
      },
      openRouterKey: () => new Promise(() => undefined),
      disk: async () => ({ freeBytes: 1, totalBytes: 2 }),
    });
    expect([...probes.clis]).toEqual([]);
    expect(probes.openRouter).toBeNull();
    expect(probes.disk).toEqual({ freeBytes: 1, totalBytes: 2 });
    expect(written).toEqual([
      "Codex sign-in: codex is not installed",
      "OpenRouter key: OpenRouter key took too long",
    ]);
  }, 20_000);

  it("keeps the CLI's answer", async () => {
    const f = fixture();
    const probes = await collectProbes({ ...f.deps, cliLogin: async () => "signed-out" });
    expect([...probes.clis]).toEqual([["codex", "signed-out"]]);
  });
});

describe("createAutopilotHealth", () => {
  it("runs one check at a time and holds its answer for Home", async () => {
    const f = fixture();
    let asked = 0;
    const health = createAutopilotHealth({
      ...f.deps,
      cliLogin: async () => {
        asked += 1;
        return "signed-in";
      },
    });
    expect(health.latest()).toBeUndefined();
    const [a, b] = await Promise.all([health.refresh(), health.refresh()]);
    expect(a).toBe(b);
    expect(asked).toBe(1);
    expect(health.latest()?.clis.get("codex")).toBe("signed-in");
  });
});

describe("autopilotView", () => {
  it("forecasts the queue running dry, warns about it and the signed-out CLI, and hides what was hidden", () => {
    const f = fixture(2);
    const view = autopilotView(f.deps, {
      checkedAt: "2026-09-01T00:00:00.000Z",
      clis: new Map([["codex", "signed-out"]]),
      openRouter: null,
      disk: null,
    });
    expect(view.checkedAt).toBe("2026-09-01T00:00:00.000Z");
    expect(view.forecast).toMatchObject({ readyCount: 0, daysAhead: 0 });
    expect(view.forecast.perSchedule).toEqual([
      expect.objectContaining({ scheduleId: f.scheduleId, queued: 2, generating: "off" }),
    ]);
    expect(view.forecast.runsDryAt).not.toBeNull();
    expect(view.warnings.map((one) => one.key)).toEqual([
      "cli-signed-out:codex",
      `few-topics:${f.scheduleId}:2`,
    ]);
    expect(view.weeklyNotify).toBe(false);
    snoozeWarning(
      f.deps.db,
      "cli-signed-out:codex",
      new Date(f.deps.clock.now().valueOf() + 60_000),
    );
    expect(autopilotView(f.deps, undefined).warnings.map((one) => one.key)).toEqual([
      `few-topics:${f.scheduleId}:2`,
    ]);
  });

  it("leaves another channel's schedules out", () => {
    const f = fixture(1);
    const view = autopilotView(f.deps, undefined, "00000000-0000-4000-8000-00000000abcd");
    expect(view.forecast.perSchedule).toEqual([]);
    expect(view.warnings).toEqual([]);
  });

  it("leaves a design schedule out: its pieces fill no video slot and it has no topics", async () => {
    const f = fixture(1);
    const before = autopilotView(f.deps, undefined);
    const service = { ...f.h.deps, emit: () => {} };
    const made = createDesignTemplate(service, {
      id: "gig-poster",
      mutationId: "mutation-0001",
      name: "Gig poster",
      document: poster({ schedule: { dateField: "Date", daysBefore: 1, time: "09:00" } }),
    });
    expect(made.ok).toBe(true);
    await markTemplateReady(service, "gig-poster", { version: 1 });
    const day = (ahead: number) =>
      new Date(f.deps.clock.now().valueOf() + ahead * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const design = createSchedule(f.scheduleDeps, {
      id: randomUUID(),
      name: "Gig posters",
      templateKind: "design",
      templateId: "gig-poster",
      templateVersion: 1,
      cadence: { kind: "by-date", time: "09:00" },
      timezone: "UTC",
      items: [3, 5].map((ahead) => ({
        title: `Set ${String(ahead)}`,
        values: { Event: `Set ${String(ahead)}`, Date: day(ahead), Venue: "Cellar", Price: "€5" },
      })),
    });
    expect(design.ok).toBe(true);
    const after = autopilotView(f.deps, undefined);
    expect(after.forecast).toEqual(before.forecast);
    expect(after.warnings).toEqual(before.warnings);
  });

  it("counts no run of a schedule whose template has no version it may run, and warns about it", () => {
    const f = fixture(2);
    const before = autopilotView(f.deps, undefined);
    expect(before.forecast.daysAhead).not.toBeNull();
    const view = autopilotView(
      { ...f.deps, notReady: () => "Not started: Lighthouses has no version marked ready." },
      undefined,
    );
    expect(view.forecast.daysAhead).toBeNull();
    expect(view.warnings.map((one) => one.key)).toContain(`template-not-ready:${f.scheduleId}`);
    expect(view.warnings.find((one) => one.key.startsWith("template-not-ready"))?.text).toBe(
      "“Nightly histories” skips its runs because its template “Lighthouses” has no version approved for schedules. Open it from Templates with Edit template, then choose More → Approve for schedules.",
    );
  });

  it("says nothing of a paused schedule's queue", () => {
    const f = fixture(1);
    expect(pauseSchedule(f.scheduleDeps, { id: f.scheduleId, baseVersion: 1 }).ok).toBe(true);
    const view = autopilotView(f.deps, undefined);
    expect(view.forecast.perSchedule[0]).toMatchObject({ paused: true, runsDryAt: null });
    expect(view.warnings).toEqual([]);
  });
});
