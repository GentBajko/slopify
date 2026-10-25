import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { insertProject } from "../admission/repo.js";
import { dailySampleBudget } from "../designs/budget.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeSetting } from "../settings/repo.js";
import {
  budgetRoom,
  budgetWords,
  fitsBudget,
  localMidnight,
  readStudioSettings,
  spentToday,
  writeStudioSettings,
} from "./budget.js";
import { removeHiddenProject } from "./hidden.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function harness() {
  const h = draftFixture();
  open.push(h.close);
  const db = h.deps.db;
  const project = (id: string) =>
    insertProject(db, {
      id,
      title: id,
      format: "16:9",
      config: {
        title: id,
        format: "16:9",
        sources: {
          research: "off",
          article: "off",
          audio: "off",
          images: "off",
          thumbnail: "off",
          video: "off",
        },
        imagePrompts: [],
        values: {},
        provided: {},
        silenceGapSeconds: 0,
        imageSeconds: 15,
        zoomPercent: 22.5,
        motionStyle: "zoom",
        edgeSilenceSeconds: 0,
        rendered: {},
      },
      createdAt: "2026-10-01T00:00:00Z",
      updatedAt: "2026-10-01T00:00:00Z",
    });
  const template = randomUUID();
  const created = createTemplate(h.deps, { id: template, name: "Show", document: h.document });
  if (!created.ok) throw new Error(created.reason);
  project("SAMPLE");
  project("REAL");
  db.prepare(
    "INSERT INTO template_samples (template_id,project_id,topic,topic_source,full_script,created_at) VALUES (?,'SAMPLE','Lighthouses','fixed',0,'2026-10-01T00:00:00Z')",
  ).run(template);
  let n = 0;
  const call = (projectId: string, at: string, cost: number | null, onPlan = 0) =>
    db
      .prepare(
        "INSERT INTO provider_usage (id,project_id,stage,kind,provider,model,wall_ms,on_plan,cost,created_at) VALUES (?,?,'images','image','fal','m',10,?,?,?)",
      )
      .run(`u${String(++n)}`, projectId, onPlan, cost, at);
  return { db, call, project, paths: h.deps.paths };
}

describe("spentToday", () => {
  it("adds up only the samples' calls billed per use since local midnight", () => {
    const { db, call } = harness();
    call("SAMPLE", "2026-10-18T07:00:00.000Z", 0.25);
    call("SAMPLE", "2026-10-18T09:00:00.000Z", 0.1);
    call("SAMPLE", "2026-10-18T09:30:00.000Z", 0.5, 1);
    call("SAMPLE", "2026-10-18T09:40:00.000Z", null);
    call("SAMPLE", "2026-10-17T21:59:00.000Z", 3);
    call("REAL", "2026-10-18T09:00:00.000Z", 9);
    // Berlin's midnight on 18 October is 22:00 UTC the day before; at 09:50 UTC Kiritimati's
    // day began at 10:00 UTC on the 17th.
    expect(spentToday(db, new Date("2026-10-18T10:00:00.000Z"), "Europe/Berlin")).toBeCloseTo(0.35);
    expect(spentToday(db, new Date("2026-10-18T09:50:00.000Z"), "Pacific/Kiritimati")).toBeCloseTo(
      3.35,
    );
  });
});

describe("unpriced sample calls", () => {
  // A call with no known price adds nothing to what was spent, so it is counted and said
  // instead of read as free.
  it("counts today's sample calls billed per use with no known price", () => {
    const { db, call } = harness();
    call("SAMPLE", "2026-10-18T09:00:00.000Z", null);
    call("SAMPLE", "2026-10-18T09:10:00.000Z", null);
    call("SAMPLE", "2026-10-18T09:20:00.000Z", null, 1);
    call("SAMPLE", "2026-10-17T09:00:00.000Z", null);
    call("REAL", "2026-10-18T09:00:00.000Z", null);
    const room = budgetRoom(db, new Date("2026-10-18T10:00:00.000Z"), "UTC");
    expect(room.unpriced).toBe(2);
    expect(budgetWords(room, { high: 1, usesPlan: false }, "This sample")).toContain(
      "plus 2 calls with no known price",
    );
  });
});

describe("spentToday with bake-off copies and removed projects", () => {
  it("counts a bake-off copy's calls, and keeps counting them once the copy is removed", () => {
    const { db, call, project, paths } = harness();
    project("COPY");
    db.prepare(
      "INSERT INTO template_bakeoffs (id,template_id,template_version,section,ack_high,state,created_at,updated_at) SELECT 'b1',template_id,1,'script',1,'making','t','t' FROM template_samples",
    ).run();
    db.prepare(
      "INSERT INTO template_bakeoff_clones (bakeoff_id,slot,provider,model,project_id,state) VALUES ('b1',0,'openrouter','m','COPY','done')",
    ).run();
    call("COPY", "2026-10-18T09:00:00.000Z", 0.4);
    call("COPY", "2026-10-18T09:10:00.000Z", 0.2, 1);
    call("SAMPLE", "2026-10-18T09:00:00.000Z", 0.1);
    const now = new Date("2026-10-18T10:00:00.000Z");
    expect(spentToday(db, now, "UTC")).toBeCloseTo(0.5);
    expect(removeHiddenProject({ db, paths, log: { write: () => undefined } }, "COPY").ok).toBe(
      true,
    );
    expect(
      db.prepare("SELECT count(*) AS n FROM provider_usage WHERE project_id='COPY'").get(),
    ).toEqual({ n: 0 });
    expect(spentToday(db, now, "UTC")).toBeCloseTo(0.5);
    // Tomorrow it no longer counts.
    expect(spentToday(db, new Date("2026-10-19T10:00:00.000Z"), "UTC")).toBe(0);
  });
});

describe("the daily budget", () => {
  it("is $2.00 until the person sets another, and survives a bad stored value", () => {
    const { db } = harness();
    expect(readStudioSettings(db)).toEqual({
      dailyBudget: 2,
      samplesUsePlans: false,
      designDailyBudget: 1,
    });
    expect(writeStudioSettings(db, { dailyBudget: 0.555 })).toEqual({
      dailyBudget: 0.56,
      samplesUsePlans: false,
      designDailyBudget: 1,
    });
    expect(readStudioSettings(db)).toEqual({
      dailyBudget: 0.56,
      samplesUsePlans: false,
      designDailyBudget: 1,
    });
    writeSetting(db, "templateStudio.dailyBudget", "{oops");
    expect(readStudioSettings(db)).toEqual({
      dailyBudget: 2,
      samplesUsePlans: false,
      designDailyBudget: 1,
    });
    writeSetting(db, "templateStudio.dailyBudget", "-4");
    expect(readStudioSettings(db)).toEqual({
      dailyBudget: 2,
      samplesUsePlans: false,
      designDailyBudget: 1,
    });
  });

  it("sets the designed pieces' budget apart from the studio's, each kept when left out", () => {
    const { db } = harness();
    writeStudioSettings(db, { dailyBudget: 3 });
    expect(writeStudioSettings(db, { designDailyBudget: 0.125 })).toEqual({
      dailyBudget: 3,
      samplesUsePlans: false,
      designDailyBudget: 0.13,
    });
    expect(dailySampleBudget(db)).toBe(0.13);
    expect(writeStudioSettings(db, { samplesUsePlans: true })).toMatchObject({
      dailyBudget: 3,
      designDailyBudget: 0.13,
    });
  });

  it("says what is left today, and whether a sample fits it", () => {
    const { db, call } = harness();
    writeStudioSettings(db, { dailyBudget: 1 });
    call("SAMPLE", "2026-10-18T09:00:00.000Z", 0.7);
    const room = budgetRoom(db, new Date("2026-10-18T10:00:00.000Z"), "UTC");
    expect(room.spent).toBeCloseTo(0.7);
    expect(room.left).toBeCloseTo(0.3);
    expect(fitsBudget(room, 0.3)).toBe(true);
    expect(fitsBudget(room, 0.31)).toBe(false);
    writeStudioSettings(db, { dailyBudget: 0 });
    expect(fitsBudget(budgetRoom(db, new Date("2026-10-18T10:00:00.000Z"), "UTC"), 0.01)).toBe(
      false,
    );
    expect(fitsBudget(budgetRoom(db, new Date("2026-10-18T10:00:00.000Z"), "UTC"), 0)).toBe(true);
  });

  it("lets samples use CLI plans only once the person turns it on, whatever the budget", () => {
    const { db } = harness();
    const now = new Date("2026-10-18T10:00:00.000Z");
    writeStudioSettings(db, { dailyBudget: 0 });
    const off = budgetRoom(db, now, "UTC");
    expect(off.plans).toBe(false);
    // A $0 budget: nothing that spends dollars or plan usage.
    expect(fitsBudget(off, 0, true)).toBe(false);
    expect(fitsBudget(off, 0, false)).toBe(true);
    expect(budgetWords(off, { high: 0, usesPlan: true }, "This sample")).toBe(
      "This sample runs on your Claude Code or Codex plan, and samples may not use it. Turn on Let samples use my Claude Code or Codex plan in Settings → Production defaults",
    );
    writeStudioSettings(db, { dailyBudget: 5 });
    expect(fitsBudget(budgetRoom(db, now, "UTC"), 0, true)).toBe(false);
    // Switching it on keeps the budget; the budget limits dollars only.
    expect(writeStudioSettings(db, { dailyBudget: 0, samplesUsePlans: true })).toEqual({
      dailyBudget: 0,
      samplesUsePlans: true,
      designDailyBudget: 1,
    });
    expect(writeStudioSettings(db, { dailyBudget: 0 })).toEqual({
      dailyBudget: 0,
      samplesUsePlans: true,
      designDailyBudget: 1,
    });
    const on = budgetRoom(db, now, "UTC");
    expect(fitsBudget(on, 0, true)).toBe(true);
    expect(fitsBudget(on, 0.2, true)).toBe(false);
    expect(budgetWords(on, { high: 0.2, usesPlan: true }, "This sample")).toBe(
      "This sample costs about $0.20 and $0.00 of today's $0.00 sample budget is left. Raise the budget in Settings → Production defaults",
    );
  });

  it("finds today's start in the person's time zone", () => {
    expect(localMidnight(new Date("2026-10-18T10:00:00.000Z"), "Europe/Berlin").toISOString()).toBe(
      "2026-10-17T22:00:00.000Z",
    );
  });
});
