import type { DatabaseSync } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import type { Clock } from "../../kernel/clock.js";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { isLocalCliProvider, type ProviderId, providerIds } from "../settings/model.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import { automaticAllowed, costOf, isVideoTarget } from "./cost.js";
import {
  baselineKey,
  type CheckCost,
  type CheckTrigger,
  type CheckVerdict,
  keyOfModel,
  type ModelCheckRow,
  type ModelKey,
} from "./model.js";
import { markNoticesSeen, writeVerdict } from "./repo.js";

export type CheckOutcome =
  | {
      readonly kind: "checked";
      readonly verdict: CheckVerdict;
      readonly sentence: string | null;
      readonly stopProvider: boolean;
      // US dollars the call cost, at list price.
      readonly spent: number;
    }
  | { readonly kind: "skipped"; readonly reason: string };

// One check call, made by the composition layer's recipes (`src/model-checks.ts`).
export type ModelChecker = (target: ModelKey, signal: AbortSignal) => Promise<CheckOutcome>;

export interface PlanTarget extends ModelKey {
  readonly account: string;
  readonly cost: CheckCost;
}

export interface CheckPlan {
  readonly trigger: CheckTrigger;
  readonly targets: readonly PlanTarget[];
  // Known list-price dollars; `unpriced` checks have no price in the model list.
  readonly totalDollars: number;
  readonly unpriced: number;
  // The CLIs whose plan allowance the checks use.
  readonly planAccounts: readonly string[];
  readonly skipped: readonly { readonly model: ModelKey; readonly reason: string }[];
}

export interface PlanInput {
  readonly catalogue: Catalogue;
  readonly rows: readonly ModelCheckRow[];
  // Every model each provider offers: the catalogue's, or what a CLI listed.
  readonly offered: readonly ModelKey[];
  readonly accounts: (provider: ProviderId) => string | undefined;
  // Models chosen in a template, schedule, draft or unfinished project (keyOfModel).
  readonly chosen: ReadonlySet<string>;
}

export interface PlanScope {
  readonly trigger: CheckTrigger;
  readonly provider?: ProviderId | undefined;
  readonly models?: readonly string[] | undefined;
}

// ceiling: an automatic run checks at most this many models of one provider (decision 7).
export const automaticPerProvider = 25;

const isProvider = (id: string): id is ProviderId =>
  (providerIds as readonly string[]).includes(id);

export function planChecks(input: PlanInput, scope: PlanScope): CheckPlan {
  const manual = scope.trigger === "manual";
  const rowOf = new Map(input.rows.map((row) => [keyOfModel(row), row]));
  const skipped: { model: ModelKey; reason: string }[] = [];
  const picked: PlanTarget[] = [];
  const perProvider = new Map<string, number>();
  const offered = input.offered.filter(
    (model) =>
      (scope.provider === undefined || model.provider === scope.provider) &&
      (scope.models === undefined || scope.models.includes(model.model)),
  );
  // Automatic runs take what is in use first, then what already worked, then what is new.
  const rank = (model: ModelKey): number => {
    const row = rowOf.get(keyOfModel(model));
    if (input.chosen.has(keyOfModel(model))) return 0;
    return row?.verdict === "works" ? 1 : 2;
  };
  const ordered = manual ? offered : [...offered].sort((a, b) => rank(a) - rank(b));
  for (const model of ordered) {
    if (!isProvider(model.provider)) continue;
    const account = input.accounts(model.provider);
    // An automatic run says nothing about what it was never going to check.
    if (account === undefined) {
      if (manual) skipped.push({ model, reason: "No key is saved for this provider." });
      continue;
    }
    if (isVideoTarget(input.catalogue, model)) {
      if (manual)
        skipped.push({ model, reason: "Image-to-video models are listed, never checked." });
      continue;
    }
    const cost = costOf(input.catalogue, model);
    if (!manual) {
      const row = rowOf.get(keyOfModel(model));
      const sameAccount = row !== undefined && row.account === account;
      const inScope =
        input.chosen.has(keyOfModel(model)) ||
        (sameAccount && row.verdict === "works") ||
        (sameAccount && row.listed === true && row.verdict === null);
      if (!inScope) continue;
      if (!automaticAllowed(input.catalogue, model, cost)) {
        skipped.push({ model, reason: "It costs money, so only Check models runs it." });
        continue;
      }
      const count = perProvider.get(model.provider) ?? 0;
      if (count >= automaticPerProvider) continue;
      perProvider.set(model.provider, count + 1);
    }
    picked.push({ ...model, account, cost });
  }
  return {
    trigger: scope.trigger,
    targets: picked,
    totalDollars: picked.reduce((sum, target) => sum + (target.cost.dollars ?? 0), 0),
    unpriced: picked.filter((target) => target.cost.dollars === null).length,
    planAccounts: [
      ...new Set(picked.filter((t) => isLocalCliProvider(t.provider)).map((t) => t.provider)),
    ],
    skipped,
  };
}

export interface RunSummary {
  readonly checked: number;
  readonly works: number;
  readonly noAccess: number;
  readonly failed: number;
  readonly skipped: number;
  readonly spent: number;
}

export interface RunDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  readonly check: ModelChecker;
}

export type RunAnswer =
  | { readonly ok: true; readonly summary: RunSummary }
  | {
      readonly ok: false;
      readonly reason: "estimate";
      readonly totalDollars: number;
      readonly unpriced: number;
    };

// A plan that costs money runs only with the person's confirmed estimate: the dollars they
// were shown must cover the plan's.
export function needsConfirmation(plan: CheckPlan, confirmedDollars: number | undefined): boolean {
  if (plan.totalDollars <= 0 && plan.unpriced === 0) return false;
  return confirmedDollars === undefined || confirmedDollars + 1e-9 < plan.totalDollars;
}

export async function runChecks(
  deps: RunDeps,
  plan: CheckPlan,
  options: { readonly confirmedDollars?: number | undefined; readonly signal?: AbortSignal } = {},
): Promise<RunAnswer> {
  if (plan.trigger === "manual" && needsConfirmation(plan, options.confirmedDollars))
    return {
      ok: false,
      reason: "estimate",
      totalDollars: plan.totalDollars,
      unpriced: plan.unpriced,
    };
  const signal = options.signal ?? new AbortController().signal;
  const tally = { checked: 0, works: 0, noAccess: 0, failed: 0, skipped: 0, spent: 0 };
  const byProvider = new Map<string, PlanTarget[]>();
  for (const target of plan.targets)
    byProvider.set(target.provider, [...(byProvider.get(target.provider) ?? []), target]);
  await Promise.all(
    [...byProvider.values()].map(async (targets) => {
      for (const target of targets) {
        if (signal.aborted) return;
        let outcome: CheckOutcome;
        try {
          outcome = await deps.check(target, signal);
        } catch (error) {
          if (signal.aborted) return;
          deps.log.write("warn", "model-checks.check", {
            detail: `${target.provider} ${target.model}: ${errorText(error)}`,
          });
          tally.failed += 1;
          continue;
        }
        if (outcome.kind === "skipped") {
          tally.skipped += 1;
          continue;
        }
        tally.checked += 1;
        tally.spent += outcome.spent;
        if (outcome.verdict === "works") tally.works += 1;
        else if (outcome.verdict === "no-access") tally.noAccess += 1;
        else tally.failed += 1;
        writeVerdict(deps.db, {
          ...target,
          verdict: outcome.verdict,
          source: "check",
          sentence: outcome.sentence,
          at: deps.clock.now().toISOString(),
          cost: outcome.spent,
        });
        // The rest of this provider's checks would fail the same way (a rejected key, a
        // used-up limit), and each might cost something.
        if (outcome.stopProvider) {
          tally.skipped += targets.length - targets.indexOf(target) - 1;
          return;
        }
      }
    }),
  );
  // What works at the first run is what the person already had: none of it is news.
  if (readSetting(deps.db, baselineKey) === undefined) {
    markNoticesSeen(deps.db, "all");
    writeSetting(deps.db, baselineKey, deps.clock.now().toISOString());
  }
  return { ok: true, summary: tally };
}
