import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { draftFixture } from "../play-drafts/draft.fake.js";
import type { PlayDraftDocument } from "../play-drafts/schema.js";
import { createTemplate } from "../project-templates/service.js";
import { writeStudioSettings } from "./budget.js";
import { queuedJob } from "./jobs.js";
import { quoteSave } from "./quote.js";
import { sampleVersions } from "./repo.js";
import { createUnknownAcks, exceedsAcknowledged, type SaveDeps, saveStudio } from "./save.js";
import { paidDocument, reviewOver } from "./studio.fake.js";

const open: (() => void)[] = [];
afterEach(() => {
  for (const close of open.splice(0)) close();
});

function harness() {
  const h = draftFixture();
  open.push(h.close);
  const review = reviewOver(h.deps);
  const document = paidDocument(review);
  const id = randomUUID();
  const created = createTemplate(h.deps, { id, name: "Show", document });
  if (!created.ok) throw new Error(created.reason);
  const deps: SaveDeps = {
    db: h.deps.db,
    clock: h.deps.clock,
    review,
    acks: createUnknownAcks(),
    timeZone: "UTC",
  };
  const changed: PlayDraftDocument = {
    ...document,
    form: { ...document.form, audio: { ...document.form.audio, voice: "other" } },
  };
  const quoted = async (doc: PlayDraftDocument = changed) => {
    const quote = await quoteSave(deps, id, doc);
    if (!quote.ok) throw new Error(quote.message);
    return quote.value;
  };
  const input = (over: Record<string, unknown> = {}) => ({
    mutationId: randomUUID(),
    baseVersion: 1,
    name: "Show",
    document: changed,
    sample: "make",
    acknowledgedHigh: 0,
    ...over,
  });
  const versions = () =>
    Number(
      h.deps.db.prepare("SELECT head_version AS v FROM project_templates WHERE id=?").get(id)?.v,
    );
  return { h, deps, id, changed, quoted, input, versions };
}

describe("saveStudio", () => {
  it("saves the next version and queues its sample at the price the person saw", async () => {
    const { deps, id, quoted, input, versions } = harness();
    const quote = await quoted();
    const result = await saveStudio(deps, id, input({ acknowledgedHigh: quote.high }));
    if (!result.ok) throw new Error(result.message);
    expect(result.value).toMatchObject({ sample: "queued", replayed: false });
    expect(result.value.template.version).toBe(2);
    expect(versions()).toBe(2);
    expect(queuedJob(deps.db, id)).toMatchObject({
      templateVersion: 2,
      kind: "save",
      ackHigh: quote.high,
    });
    expect(sampleVersions(deps.db, id)[0]).toMatchObject({
      templateVersion: 2,
      state: "queued",
      quotedHigh: quote.high,
    });
  });

  it("saves without a sample: the free samples only, and the version marked skipped", async () => {
    const { deps, id, input } = harness();
    const result = await saveStudio(deps, id, input({ sample: "skip" }));
    if (!result.ok) throw new Error(result.message);
    expect(result.value).toMatchObject({ sample: "skipped", quote: null });
    expect(queuedJob(deps.db, id)).toMatchObject({ templateVersion: 2, kind: "free", ackHigh: 0 });
    expect(sampleVersions(deps.db, id)[0]).toMatchObject({ templateVersion: 2, state: "skipped" });
  });

  it("answers a Save sent twice as it did the first time, with no second version", async () => {
    const { deps, id, quoted, input, versions } = harness();
    const once = input({ acknowledgedHigh: (await quoted()).high });
    expect((await saveStudio(deps, id, once)).ok).toBe(true);
    const again = await saveStudio(deps, id, once);
    expect(again.ok && again.value.replayed).toBe(true);
    expect(versions()).toBe(2);
  });

  it("refuses a Save made on an older version, saving nothing", async () => {
    const { deps, id, input, versions } = harness();
    expect((await saveStudio(deps, id, input({ sample: "skip" }))).ok).toBe(true);
    const stale = await saveStudio(deps, id, input({ sample: "skip" }));
    expect(stale).toMatchObject({ ok: false, reason: "conflict" });
    expect(!stale.ok && stale.message).toContain("it is now version 2. Reload the studio");
    expect(versions()).toBe(2);
  });

  it("refuses a sample that now costs more than the person saw, with the new quote, spending nothing", async () => {
    const { deps, id, quoted, input, versions } = harness();
    const quote = await quoted();
    expect(quote.high).toBeGreaterThan(0.05);
    const result = await saveStudio(deps, id, input({ acknowledgedHigh: 0 }));
    expect(result).toMatchObject({ ok: false, reason: "cost-changed" });
    if (result.ok) return;
    expect(result.quote?.high).toBe(quote.high);
    expect(result.message).toContain("more than the $0.00 you saw");
    expect(versions()).toBe(1);
    expect(queuedJob(deps.db, id)).toBeUndefined();
  });

  it("asks the person to accept unknown prices before a sample is queued", async () => {
    const { deps, id, changed, input } = harness();
    const unpriced: PlayDraftDocument = {
      ...changed,
      form: {
        ...changed.form,
        audio: { provider: "openai-tts", model: "gpt-4o-mini-tts", voice: "alloy" },
      },
    };
    const quote = await quoteSave(deps, id, unpriced);
    if (!quote.ok) throw new Error(quote.message);
    expect(quote.value.unknown).toBeGreaterThan(0);
    const refused = await saveStudio(
      deps,
      id,
      input({ document: unpriced, acknowledgedHigh: quote.value.high }),
    );
    expect(refused).toMatchObject({ ok: false, reason: "cost-changed" });
    expect(!refused.ok && refused.message).toContain("no known price");
    const accepted = await saveStudio(
      deps,
      id,
      input({ document: unpriced, acknowledgedHigh: quote.value.high, acknowledgedUnknown: true }),
    );
    expect(accepted.ok).toBe(true);
    expect(deps.acks.accepted(id, 2)).toBe(true);
  });

  it("refuses a sample past today's budget, offering Save without a sample", async () => {
    const { deps, id, quoted, input } = harness();
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    const quote = await quoted();
    const result = await saveStudio(deps, id, input({ acknowledgedHigh: quote.high }));
    expect(result).toMatchObject({ ok: false, reason: "over-budget" });
    expect(!result.ok && result.message).toContain(
      "Raise the budget in Settings → Template studio, or press Save without a sample.",
    );
    expect(queuedJob(deps.db, id)).toBeUndefined();
  });

  it("holds a sample on a CLI plan until the person lets samples use plans, whatever the budget", async () => {
    const { deps: base, id, changed, input } = harness();
    // Claude Code lists its own models; the fixture's catalogue has none of them.
    const deps: SaveDeps = {
      ...base,
      review: {
        ...base.review,
        modelsFor: async (provider, family) =>
          provider === "claude-code"
            ? [{ id: "sonnet", name: "Sonnet" }]
            : base.review.modelsFor(provider, family),
      },
    };
    const onPlan: PlayDraftDocument = {
      ...changed,
      form: { ...changed.form, llm: { provider: "claude-code", model: "sonnet" } },
    };
    writeStudioSettings(deps.db, { dailyBudget: 0 });
    const held = await quoteSave(deps, id, onPlan);
    if (!held.ok) throw new Error(held.message);
    expect(held.value.problem).toBeNull();
    expect(held.value).toMatchObject({ usesPlan: true, fits: false });
    const refused = await saveStudio(
      deps,
      id,
      input({ document: onPlan, acknowledgedHigh: held.value.high, acknowledgedUnknown: true }),
    );
    expect(refused).toMatchObject({ ok: false, reason: "over-budget" });
    expect(!refused.ok && refused.message).toBe(
      "This sample runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans in Settings → Template studio, or press Save without a sample.",
    );
    expect(queuedJob(deps.db, id)).toBeUndefined();
    // Allowed, a sample whose only cost is plan usage starts at a $0 budget.
    writeStudioSettings(deps.db, { dailyBudget: 0, samplesUsePlans: true });
    const allowed = await quoteSave(deps, id, onPlan);
    if (!allowed.ok) throw new Error(allowed.message);
    expect(allowed.value.budget.plans).toBe(true);
    expect(allowed.value.usesPlan).toBe(true);
    expect(allowed.value.fits).toBe(allowed.value.high === 0);
  });

  it("says why no sample can be made when Play's review refuses the setup", async () => {
    const { deps, id, changed, input } = harness();
    const result = await saveStudio(
      deps,
      id,
      input({
        document: {
          ...changed,
          form: { ...changed.form, llm: { provider: "openrouter", model: "gone" } },
        },
      }),
    );
    expect(result).toMatchObject({ ok: false, reason: "invalid-input" });
    expect(!result.ok && result.message).toContain(
      "Press Save without a sample to keep the change.",
    );
  });

  it("refuses what it can't read and a template that is gone", async () => {
    const { deps, id, input } = harness();
    expect(await saveStudio(deps, id, { nope: true })).toMatchObject({ reason: "invalid-input" });
    expect(await saveStudio(deps, randomUUID(), input())).toMatchObject({ reason: "not-found" });
  });
});

describe("exceedsAcknowledged", () => {
  it("allows a quarter more and five cents, never more", () => {
    expect(exceedsAcknowledged(0.55, 0.4)).toBe(false);
    expect(exceedsAcknowledged(0.56, 0.4)).toBe(true);
    expect(exceedsAcknowledged(0.05, 0)).toBe(false);
    expect(exceedsAcknowledged(0.06, 0)).toBe(true);
  });
});
