import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { attachSamples } from "../../kernel/paths.js";
import { projectExists } from "../admission/repo.js";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeStudioSettings } from "./budget.js";
import { queuedJob } from "./jobs.js";
import { makePaidSample } from "./paid.js";
import { quoteSample } from "./quote.js";
import { sampleOf, sampleProjects } from "./repo.js";
import type { SaveDeps } from "./save.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";
import { setFullScript, setSampleTopic } from "./topic.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function harness() {
  const h = draftFixture();
  open.push(h.close);
  attachSamples(h.deps.paths, sampleProjects(h.deps.db, h.deps.paths.dataDir));
  const { review, paid } = paidSampleDeps(h.deps);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document: paidDocument(review) });
  if (!created.ok) throw new Error(created.reason);
  const deps: SaveDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    review,
    acks: paid.acks,
    timeZone: "UTC",
  };
  const price = async (ask: Parameters<typeof quoteSample>[2]) => {
    const quote = await quoteSample(deps, id, ask);
    if (!quote.ok) throw new Error(quote.message);
    return quote.value.high;
  };
  return { h, deps, paid, id, price };
}

describe("setSampleTopic", () => {
  it("keeps a template's topic for its first sample and queues it at the price shown", async () => {
    const { deps, id, price } = harness();
    const high = await price({ topic: "Salt roads", sections: "all" });
    const result = await setSampleTopic(deps, id, { topic: "Salt roads", acknowledgedHigh: high });
    expect(result).toMatchObject({
      ok: true,
      value: { topic: "Salt roads", topicSource: "fixed" },
    });
    expect(sampleOf(deps.db, id)).toMatchObject({ topic: "Salt roads", topicSource: "fixed" });
    expect(queuedJob(deps.db, id)).toMatchObject({ kind: "topic", ackHigh: high });
  });

  it("starts a new topic's sample on a project of its own", async () => {
    const { deps, paid, id, price } = harness();
    await makePaidSample(
      paid,
      { templateId: id, templateVersion: 1, ackHigh: 5, kind: "save", requestedAt: "a" },
      new AbortController().signal,
    );
    const old = sampleOf(deps.db, id)?.projectId ?? "";
    const high = await price({ topic: "Salt roads", sections: "all" });
    expect(
      (await setSampleTopic(deps, id, { topic: "Salt roads", acknowledgedHigh: high })).ok,
    ).toBe(true);
    await makePaidSample(
      paid,
      { templateId: id, templateVersion: 1, ackHigh: high, kind: "topic", requestedAt: "b" },
      new AbortController().signal,
    );
    const fresh = sampleOf(deps.db, id);
    expect(fresh?.projectId).not.toBe(old);
    expect(projectExists(deps.db, old)).toBe(false);
    const title = deps.db
      .prepare("SELECT title FROM projects WHERE id=?")
      .get(fresh?.projectId ?? "");
    expect(title).toEqual({ title: "History: Salt roads" });
  });

  it("takes the next topic a schedule has queued, and says what to do when none has", async () => {
    const { deps, id } = harness();
    const none = await setSampleTopic(deps, id, { topic: "next-queued", acknowledgedHigh: 5 });
    expect(none).toMatchObject({
      ok: false,
      reason: "invalid-input",
      message:
        "No schedule of this template has a topic queued. Add topics in Calendar → Schedules, or type a topic for the sample.",
    });
    deps.db
      .prepare(
        `INSERT INTO schedules(id,name,template_id,template_version,cadence_json,timezone,missed_policy,overlap_policy,items_json,topic_keyword,status,version,creation_hash,created_at,updated_at)
         VALUES (?,'Daily',?,1,'{"kind":"daily","time":"09:00"}','UTC','skip','skip','[{"title":"Tea clippers","values":{}}]','Topic','active',1,'h','a','a')`,
      )
      .run(randomUUID(), id);
    const queued = await setSampleTopic(deps, id, { topic: "next-queued", acknowledgedHigh: 5 });
    expect(queued).toMatchObject({
      ok: true,
      value: { topic: "Tea clippers", topicSource: "queued" },
    });
  });

  it("refuses at a higher price or past the budget, changing nothing", async () => {
    const { deps, id } = harness();
    const higher = await setSampleTopic(deps, id, { topic: "Salt roads", acknowledgedHigh: 0 });
    expect(higher).toMatchObject({ ok: false, reason: "cost-changed" });
    expect(!higher.ok && "quote" in higher && higher.quote?.high).toBeGreaterThan(0);
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    expect(
      await setSampleTopic(deps, id, { topic: "Salt roads", acknowledgedHigh: 5 }),
    ).toMatchObject({ ok: false, reason: "over-budget" });
    expect(sampleOf(deps.db, id)).toBeUndefined();
    expect(queuedJob(deps.db, id)).toBeUndefined();
    expect(await setSampleTopic(deps, id, { topic: " ", acknowledgedHigh: 5 })).toMatchObject({
      reason: "invalid-input",
    });
  });
});

describe("setFullScript", () => {
  it("prices the script and what follows it, and records the choice for the next sample", async () => {
    const { deps, id, price } = harness();
    const high = await price({ fullScript: true, sections: ["script"] });
    const result = await setFullScript(deps, id, { fullScript: true, acknowledgedHigh: high * 10 });
    expect(result).toMatchObject({ ok: true, value: { fullScript: true } });
    expect(sampleOf(deps.db, id)?.fullScript).toBe(true);
    expect(queuedJob(deps.db, id)).toMatchObject({ kind: "full-script" });
  });
});
