import { setImmediate as yieldTurn } from "node:timers/promises";
import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { templateById, templateSummaries } from "../project-templates/repo.js";
import { type BudgetRoom, budgetRoom, budgetWords, fitsBudget, plansSwitch } from "./budget.js";
import { enqueueJob } from "./jobs.js";
import type { StudioRefusal, TemplateSection } from "./model.js";
import { quoteSample } from "./quote.js";
import { sampleVersions, setSampleVersion } from "./repo.js";
import { exceedsAcknowledged, type SaveDeps } from "./save.js";
import { affectedSections } from "./sections.js";
import { paidSections } from "./status.js";

// Settings → Production defaults → Make samples for all: the paid sample of every template whose
// newest version has none, priced together first. Today's budget is spent in name order; the
// templates past it wait, saying so, and nothing is spent above the total the person saw.

export interface ForAllItem {
  readonly templateId: string;
  readonly name: string;
  readonly version: number;
  readonly high: number;
  readonly unknown: number;
  // Some step runs on a CLI plan.
  readonly usesPlan: boolean;
  // It fits what is left of today's budget after the ones before it, and may use a CLI plan
  // when it needs one.
  readonly fits: boolean;
  // Why no sample can be made of it (Play's review refused its setup), or null.
  readonly problem: string | null;
}

export interface ForAllQuote {
  readonly items: readonly ForAllItem[];
  // The high estimate of every item that can be made.
  readonly total: number;
  readonly fitting: number;
  readonly budget: BudgetRoom;
  readonly sentence: string;
}

const money = (value: number) => `$${value.toFixed(2)}`;

// The sections a template's newest version has no sample of: every one before its first
// sample, the ones changed since the last one made, none when it is made or on its way.
function wanted(
  deps: Pick<SaveDeps, "db">,
  templateId: string,
): readonly TemplateSection[] | "all" | "none" {
  const head = templateById(deps.db, templateId);
  if (head === undefined) return "none";
  const versions = sampleVersions(deps.db, templateId);
  const row = versions.find((one) => one.templateVersion === head.version);
  if (row !== undefined && ["done", "queued", "making"].includes(row.state)) return "none";
  const done = versions.find((one) => one.state === "done" && one.templateVersion <= head.version);
  const from =
    done === undefined ? undefined : templateById(deps.db, templateId, done.templateVersion);
  if (from === undefined) return "all";
  const paid = new Set<TemplateSection>(paidSections);
  const changed = affectedSections(from.document, head.document).filter((one) => paid.has(one));
  return changed.length === 0 ? "none" : changed;
}

export async function quoteSamplesForAll(deps: SaveDeps): Promise<ForAllQuote> {
  const room = budgetRoom(deps.db, deps.clock.now(), deps.timeZone);
  const items: ForAllItem[] = [];
  let used = 0;
  for (const template of templateSummaries(deps.db)) {
    const sections = wanted(deps, template.id);
    if (sections === "none") continue;
    // Each price resolves a draft through Play's review: the server stays answering between them.
    await yieldTurn();
    const quoted = await quoteSample(deps, template.id, { sections });
    if (!quoted.ok) continue;
    const { high, unknown, problem, usesPlan } = quoted.value;
    const fits = problem === null && fitsBudget(room, used + high, usesPlan);
    if (fits) used += high;
    items.push({
      templateId: template.id,
      name: template.name,
      version: quoted.value.version,
      high: problem === null ? high : 0,
      unknown: problem === null ? unknown : 0,
      usesPlan: problem === null && usesPlan,
      fits,
      problem,
    });
  }
  const makeable = items.filter((item) => item.problem === null);
  const total = makeable.reduce((sum, item) => sum + item.high, 0);
  const fitting = makeable.filter((item) => item.fits).length;
  return {
    items,
    total,
    fitting,
    budget: room,
    sentence: sentenceOf(makeable, room),
  };
}

function sentenceOf(makeable: readonly ForAllItem[], room: BudgetRoom): string {
  const count = makeable.length;
  if (count === 0)
    return "Every template's sample is made for its newest version. Nothing to make.";
  const total = makeable.reduce((sum, item) => sum + item.high, 0);
  const fitting = makeable.filter((item) => item.fits).length;
  const head = `${String(count)} ${count === 1 ? "template needs" : "templates need"} a sample: about ${money(total)} in all.`;
  if (fitting === count) return head;
  const waiting = count - fitting;
  const onPlan = makeable.filter((item) => !item.fits && item.usesPlan && !room.plans).length;
  const why =
    onPlan === waiting
      ? `: they run on your Claude Code or Codex plan, which samples may not use (turn on ${plansSwitch} in Settings → Production defaults)`
      : onPlan > 0
        ? `: ${String(onPlan)} run on your Claude Code or Codex plan, which samples may not use (turn on ${plansSwitch} in Settings → Production defaults), and the rest wait for tomorrow or a higher budget`
        : " for tomorrow or a higher budget in Settings → Production defaults";
  return `${head} ${String(fitting)} of them ${fitting === 1 ? "fits" : "fit"} today's budget; the other ${String(waiting)} wait${why}.`;
}

export const samplesForAllSchema = z
  .object({
    // The total the button showed.
    acknowledgedTotal: z.number().finite().min(0).max(100_000),
    // That some steps have no price, and the person accepts it.
    acknowledgedUnknown: z.boolean().optional(),
  })
  .strict()
  .readonly();

export type ForAllResult =
  | {
      readonly ok: true;
      readonly value: {
        readonly queued: readonly string[];
        readonly held: readonly string[];
        readonly quote: ForAllQuote;
      };
    }
  | {
      readonly ok: false;
      readonly reason: StudioRefusal;
      readonly message: string;
      readonly quote?: ForAllQuote;
    };

const budgetHeld =
  "Waiting: today's sample budget is used by the other templates' samples. Press Make sample tomorrow, or raise the budget in Settings → Production defaults.";

export async function makeSamplesForAll(deps: SaveDeps, raw: unknown): Promise<ForAllResult> {
  const parsed = samplesForAllSchema.safeParse(raw);
  if (!parsed.success)
    return {
      ok: false,
      reason: "invalid-input",
      message:
        "Settings sent a request Slopify couldn't read. Reload the page and press Make samples for all again.",
    };
  const quote = await quoteSamplesForAll(deps);
  if (exceedsAcknowledged(quote.total, parsed.data.acknowledgedTotal))
    return {
      ok: false,
      reason: "cost-changed",
      message: `Making them now costs about ${money(quote.total)}, more than the ${money(parsed.data.acknowledgedTotal)} you saw. Press Make samples for all again to accept the new price.`,
      quote,
    };
  const at = deps.clock.now().toISOString();
  // Each sample's share of the total the person saw: its leeway is applied once, at make time.
  const seenShare = quote.total > 0 ? Math.min(1, parsed.data.acknowledgedTotal / quote.total) : 1;
  const queued: string[] = [];
  const held: string[] = [];
  transact(deps.db, () => {
    for (const item of quote.items) {
      if (item.problem !== null) continue;
      const head = templateById(deps.db, item.templateId);
      // Saved again meanwhile: its own Save made (or skipped) that version's sample.
      if (head === undefined || head.version !== item.version) continue;
      const unpriced = item.unknown > 0 && parsed.data.acknowledgedUnknown !== true;
      if (!item.fits || unpriced) {
        setSampleVersion(deps.db, item.templateId, item.version, {
          state: "held",
          at,
          quotedHigh: item.high,
          heldReason: unpriced
            ? `Waiting: ${String(item.unknown)} ${item.unknown === 1 ? "step of this sample has" : "steps of this sample have"} no known price. Press Make sample to accept that and make it.`
            : item.usesPlan && !quote.budget.plans
              ? `Waiting: ${budgetWords(quote.budget, item, "this sample")}, then press Make sample.`
              : budgetHeld,
        });
        held.push(item.templateId);
        continue;
      }
      // Its unknown prices were accepted above, or its quote priced every step.
      deps.acks.accept(item.templateId, item.version);
      setSampleVersion(deps.db, item.templateId, item.version, {
        state: "queued",
        at,
        quotedHigh: item.high,
        heldReason: null,
      });
      enqueueJob(deps.db, {
        templateId: item.templateId,
        templateVersion: item.version,
        ackHigh: item.high * seenShare,
        kind: "save",
        requestedAt: at,
      });
      queued.push(item.templateId);
    }
  });
  return { ok: true, value: { queued, held, quote } };
}
