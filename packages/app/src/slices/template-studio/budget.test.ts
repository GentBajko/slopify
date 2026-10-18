import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { insertProject } from "../admission/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeSetting } from "../settings/repo.js";
import {
  budgetRoom,
  fitsBudget,
  localMidnight,
  readStudioSettings,
  spentToday,
  writeStudioSettings,
} from "./budget.js";

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
  return { db, call };
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

describe("the daily budget", () => {
  it("is $2.00 until the person sets another, and survives a bad stored value", () => {
    const { db } = harness();
    expect(readStudioSettings(db)).toEqual({ dailyBudget: 2 });
    expect(writeStudioSettings(db, { dailyBudget: 0.555 })).toEqual({ dailyBudget: 0.56 });
    expect(readStudioSettings(db)).toEqual({ dailyBudget: 0.56 });
    writeSetting(db, "templateStudio.dailyBudget", "{oops");
    expect(readStudioSettings(db)).toEqual({ dailyBudget: 2 });
    writeSetting(db, "templateStudio.dailyBudget", "-4");
    expect(readStudioSettings(db)).toEqual({ dailyBudget: 2 });
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

  it("finds today's start in the person's time zone", () => {
    expect(localMidnight(new Date("2026-10-18T10:00:00.000Z"), "Europe/Berlin").toISOString()).toBe(
      "2026-10-17T22:00:00.000Z",
    );
  });
});
