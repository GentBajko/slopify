import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import { createTemplate } from "../project-templates/service.js";
import { writeStudioSettings } from "./budget.js";
import { makeSamplesForAll, quoteSamplesForAll } from "./for-all.js";
import { queuedJob } from "./jobs.js";
import { sampleVersions, setSampleVersion } from "./repo.js";
import type { SaveDeps } from "./save.js";
import { paidDocument, paidSampleDeps } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function harness(names: readonly string[] = ["Alpha", "Beta", "Gamma"]) {
  const h = draftFixture();
  open.push(h.close);
  const { review, paid } = paidSampleDeps(h.deps);
  const document = paidDocument(review);
  const ids = names.map((name) => {
    const id = randomUUID();
    const made = createTemplate(h.deps, { id, name, document });
    if (!made.ok) throw new Error(made.reason);
    return id;
  });
  const deps: SaveDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    review,
    acks: paid.acks,
    timeZone: "UTC",
  };
  return { h, deps, ids };
}

describe("quoteSamplesForAll", () => {
  it("prices every template whose newest version has no sample, with the total first", async () => {
    const { h, deps, ids } = harness();
    // Beta's sample is made for its newest version already.
    setSampleVersion(h.deps.db, ids[1] ?? "", 1, { state: "done", at: "a" });
    const quote = await quoteSamplesForAll(deps);
    expect(quote.items.map((item) => item.name)).toEqual(["Alpha", "Gamma"]);
    expect(quote.items.every((item) => item.high > 0 && item.fits)).toBe(true);
    expect(quote.total).toBeCloseTo((quote.items[0]?.high ?? 0) + (quote.items[1]?.high ?? 0));
    expect(quote.fitting).toBe(2);
    expect(quote.sentence).toMatch(/^2 templates need a sample: about \$\d+\.\d\d in all\.$/u);
  });

  it("says how many fit today's budget when not all of them do", async () => {
    const { deps } = harness();
    const all = await quoteSamplesForAll(deps);
    const one = all.items[0]?.high ?? 0;
    writeStudioSettings(deps.db, { dailyBudget: one + 0.001 });
    const quote = await quoteSamplesForAll(deps);
    expect(quote.items.map((item) => item.fits)).toEqual([true, false, false]);
    expect(quote.fitting).toBe(1);
    expect(quote.sentence).toContain(
      "1 of them fits today's budget; the other 2 wait for tomorrow or a higher budget in Settings → Template studio.",
    );
  });

  it("says there is nothing to make when every template's sample is current", async () => {
    const { h, deps, ids } = harness(["Alpha"]);
    setSampleVersion(h.deps.db, ids[0] ?? "", 1, { state: "done", at: "a" });
    expect(await quoteSamplesForAll(deps)).toMatchObject({
      items: [],
      total: 0,
      sentence: "Every template's sample is made for its newest version. Nothing to make.",
    });
  });
});

describe("makeSamplesForAll", () => {
  it("queues each one that fits at its price and holds the rest on today's budget, spending nothing more", async () => {
    const { deps, ids } = harness();
    const all = await quoteSamplesForAll(deps);
    writeStudioSettings(deps.db, { dailyBudget: (all.items[0]?.high ?? 0) + 0.001 });
    const quote = await quoteSamplesForAll(deps);
    const made = await makeSamplesForAll(deps, { acknowledgedTotal: quote.total });
    if (!made.ok) throw new Error(made.message);
    expect(made.value.queued).toEqual([ids[0]]);
    expect(queuedJob(deps.db, ids[0] ?? "")).toMatchObject({ kind: "save" });
    expect(queuedJob(deps.db, ids[1] ?? "")).toBeUndefined();
    expect(sampleVersions(deps.db, ids[1] ?? "")[0]).toMatchObject({
      state: "held",
      heldReason:
        "Waiting: today's sample budget is used by the other templates' samples. Press Make sample tomorrow, or raise the budget in Settings → Template studio.",
    });
  });

  it("holds each sample to its share of the total the person saw, not to the new price", async () => {
    const { deps, ids } = harness(["Alpha"]);
    writeStudioSettings(deps.db, { dailyBudget: 100 });
    const quote = await quoteSamplesForAll(deps);
    // Shown a little less than it costs now: within what may still go ahead.
    const seen = quote.total / 1.2;
    const made = await makeSamplesForAll(deps, { acknowledgedTotal: seen });
    if (!made.ok) throw new Error(made.message);
    expect(queuedJob(deps.db, ids[0] ?? "")?.ackHigh).toBeCloseTo(seen, 6);
  });

  it("refuses with the new quote when the total went up since it was shown", async () => {
    const { deps, ids } = harness();
    const made = await makeSamplesForAll(deps, { acknowledgedTotal: 0 });
    if (made.ok) throw new Error("made");
    expect(made.reason).toBe("cost-changed");
    expect(made.message).toMatch(
      /^Making them now costs about \$\d+\.\d\d, more than the \$0\.00 you saw\. Press Make samples for all again to accept the new price\.$/u,
    );
    expect(made.quote?.items).toHaveLength(3);
    expect(queuedJob(deps.db, ids[0] ?? "")).toBeUndefined();
  });

  it("refuses a request it can't read", async () => {
    const { deps } = harness([]);
    expect(await makeSamplesForAll(deps, { acknowledgedTotal: -1 })).toMatchObject({
      ok: false,
      reason: "invalid-input",
    });
  });
});
