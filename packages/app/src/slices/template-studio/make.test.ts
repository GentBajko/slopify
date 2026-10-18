import { randomUUID } from "node:crypto";
import { afterEach, expect, it } from "vitest";
import { defaultLoudness } from "../loudness/model.js";
import { reviewFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { createFreeSamples } from "./free.js";
import { sampleMaker } from "./make.js";
import { createPriceCache, priceKey } from "./service.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function setup() {
  const h = reviewFixture();
  open.push(h.close);
  const id = randomUUID();
  const created = createTemplate(h.deps, {
    id,
    name: "Show",
    document: { ...h.document, form: { ...h.document.form, title: "{{Topic}}" } },
  });
  if (!created.ok) throw new Error(created.reason);
  return { h, id };
}

function addSchedule(h: ReturnType<typeof setup>["h"], templateId: string): string {
  const id = randomUUID();
  h.deps.db
    .prepare(
      `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,topic_keyword,status,version,creation_hash,created_at,updated_at)
       VALUES (?,'Daily',?,1,'{"kind":"daily","time":"09:00"}','UTC','skip','skip','[{"title":"Salt roads","values":{}}]','Topic','active',1,'h','a','a')`,
    )
    .run(id, templateId);
  return id;
}

it("makes the free samples, then prices each schedule's run once, telling the studio as it goes", async () => {
  const { h, id } = setup();
  const scheduleId = addSchedule(h, id);
  const prices = createPriceCache();
  const changed: string[] = [];
  const made: string[] = [];
  const free = createFreeSamples({ loudnessDefault: () => defaultLoudness });
  const make = sampleMaker({
    db: h.deps.db,
    free: { ...free, make: async (document) => void made.push(document.form.title) },
    prices,
    review: h.deps,
    changed: (one) => changed.push(one),
  });
  const job = {
    templateId: id,
    templateVersion: 1,
    ackHigh: 0,
    kind: "free" as const,
    requestedAt: "a",
  };
  await make(job, new AbortController().signal);
  expect(made).toEqual(["{{Topic}}"]);
  expect(prices.get(priceKey({ id: scheduleId, version: 1 }, { id, version: 1 }))).toEqual({
    high: 0,
    unknown: 0,
  });
  expect(changed).toEqual([id, id]);
  await make(job, new AbortController().signal);
  expect(changed).toEqual([id, id, id]);
});

it("makes nothing for a template deleted since its job was queued", async () => {
  const { h } = setup();
  const made: string[] = [];
  const free = createFreeSamples({ loudnessDefault: () => defaultLoudness });
  const make = sampleMaker({
    db: h.deps.db,
    free: { ...free, make: async () => void made.push("x") },
    prices: createPriceCache(),
    review: h.deps,
    changed: () => undefined,
  });
  await make(
    { templateId: randomUUID(), templateVersion: 1, ackHigh: 0, kind: "free", requestedAt: "a" },
    new AbortController().signal,
  );
  expect(made).toEqual([]);
});
