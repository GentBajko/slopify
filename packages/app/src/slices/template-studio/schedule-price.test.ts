import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { reviewFixture } from "../play-drafts/draft.fake.js";
import type { ProjectTemplate } from "../project-templates/model.js";
import type { ScheduleSummary } from "../schedules/schema.js";
import { priceScheduledRun } from "./schedule-price.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function setup() {
  const h = reviewFixture();
  open.push(h.close);
  const template: ProjectTemplate = {
    id: randomUUID(),
    name: "Show",
    version: 1,
    createdAt: "a",
    updatedAt: "a",
    document: { ...h.document, form: { ...h.document.form, title: "{{Topic}}" } },
  };
  const schedule = {
    id: randomUUID(),
    name: "Daily",
    templateId: template.id,
    items: [{ title: "Salt roads", values: {} }],
    topicKeyword: "Topic",
    values: {},
  } as unknown as ScheduleSummary;
  return { h, template, schedule };
}

it("prices a scheduled run with its first topic, saving no draft", async () => {
  const { h, template, schedule } = setup();
  expect(await priceScheduledRun(h.deps, template, schedule)).toEqual({ high: 0, unknown: 0 });
  expect(h.deps.db.prepare("SELECT count(*) AS n FROM play_drafts").get()).toEqual({ n: 0 });
});

it("says why a run can't be priced, in Play's own words", async () => {
  const { h, template, schedule } = setup();
  const broken: ProjectTemplate = {
    ...template,
    document: {
      ...template.document,
      form: {
        ...template.document.form,
        provided: { ...template.document.form.provided, article: "" },
      },
    },
  };
  const price = await priceScheduledRun(h.deps, broken, schedule);
  expect(typeof price).toBe("string");
  expect(String(price).length).toBeGreaterThan(10);
});
