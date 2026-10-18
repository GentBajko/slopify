import type { DatabaseSync } from "node:sqlite";
import type { Catalogue } from "../../catalog/schema.js";
import type { Clock } from "../../kernel/clock.js";
import type { Log } from "../../kernel/log.js";
import type { ModelInfo, ProviderFamily } from "../../kernel/ports/model.js";
import { choiceSites } from "../model-upkeep/usage.js";
import {
  isUncataloguedProvider,
  type ProviderId,
  providerById,
  providerIds,
  providers,
} from "../settings/model.js";
import { readSetting, writeSetting } from "../settings/repo.js";
import type { Listing } from "./listing.js";
import {
  type CheckTrigger,
  keyOfModel,
  type ModelCheckRow,
  type ModelKey,
  type ModelStandingView,
  type Retiring,
  weeklyAtKey,
} from "./model.js";
import { accountOf, readAuto, readChecks } from "./repo.js";
import { newForYou, standingOf } from "./rules.js";
import {
  type CheckPlan,
  type ModelChecker,
  needsConfirmation,
  planChecks,
  type RunSummary,
  runChecks,
} from "./run.js";

export interface ModelChecksDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  readonly catalogue: () => Catalogue;
  readonly check: ModelChecker;
  readonly listing: Listing;
  // What a CLI or the system voice offers (their models are not in the catalogue).
  readonly providerModels: (
    provider: ProviderId,
    family: ProviderFamily,
  ) => Promise<readonly ModelInfo[]>;
  // A model the lifecycle list says is retiring, with its replacement.
  readonly retiring?: ((model: ModelKey) => Retiring | undefined) | undefined;
}

export type StartAnswer =
  | { readonly ok: true; readonly plan: CheckPlan; readonly done: Promise<RunSummary> }
  | { readonly ok: false; readonly reason: "estimate"; readonly plan: CheckPlan }
  | { readonly ok: false; readonly reason: "running"; readonly providers: readonly ProviderId[] };

export interface ProviderCheckState {
  readonly provider: ProviderId;
  readonly family: ProviderFamily;
  readonly running: boolean;
  readonly lastCheckedAt: string | null;
  readonly spent: number;
  readonly works: number;
  readonly noAccess: number;
  readonly listed: number;
}

export interface NewModel extends ModelKey {
  readonly name: string;
  readonly firstWorksAt: string;
}

export interface ChecksOverview {
  readonly auto: ReturnType<typeof readAuto>;
  readonly providers: readonly ProviderCheckState[];
  readonly newForYou: readonly NewModel[];
}

// ceiling: the weekly look runs once seven days have passed since the last one.
export const weeklyIntervalMs = 7 * 24 * 60 * 60_000;

function familyOfSlot(slot: string): ProviderFamily {
  return slot === "llm" ? "llm" : slot === "audio" ? "tts" : "image";
}

export function chosenModels(db: DatabaseSync): ReadonlySet<string> {
  const chosen = new Set<string>();
  for (const site of choiceSites(db))
    for (const [slot, choice] of Object.entries(site.choices)) {
      if (choice === undefined || choice.provider === "" || choice.model.trim() === "") continue;
      chosen.add(
        keyOfModel({ provider: choice.provider, family: familyOfSlot(slot), model: choice.model }),
      );
    }
  return chosen;
}

export interface ModelChecks {
  readonly offered: (provider: ProviderId) => Promise<readonly ModelKey[]>;
  readonly plan: (scope: {
    readonly trigger: CheckTrigger;
    readonly provider?: ProviderId | undefined;
    readonly models?: readonly string[] | undefined;
  }) => Promise<CheckPlan>;
  readonly start: (
    scope: Parameters<ModelChecks["plan"]>[0],
    confirmedDollars?: number,
  ) => Promise<StartAnswer>;
  // A key saved, a CLI added, the weekly look: list, then check what is free to check.
  readonly automatic: (trigger: CheckTrigger, provider?: ProviderId) => Promise<void>;
  readonly weeklyDue: () => boolean;
  readonly standings: (
    provider: ProviderId,
    models: readonly ModelInfo[],
  ) => Readonly<Record<string, ModelStandingView>>;
  readonly overview: () => ChecksOverview;
  readonly running: () => readonly ProviderId[];
  readonly stop: () => void;
}

export function createModelChecks(deps: ModelChecksDeps): ModelChecks {
  const running = new Set<ProviderId>();
  const stopping = new AbortController();
  const offered = async (provider: ProviderId): Promise<readonly ModelKey[]> => {
    const { family } = providerById(provider);
    if (isUncataloguedProvider(provider)) {
      const models = await deps.providerModels(provider, family).catch(() => []);
      return models.map((model) => ({ provider, family, model: model.id }));
    }
    return deps
      .catalogue()
      [family].filter((row) => row.provider === provider && row.enabled && !row.deprecated)
      .map((row) => ({ provider, family, model: row.id }));
  };
  const withAccount = (): ProviderId[] =>
    providerIds.filter((id) => accountOf(deps.db, id) !== undefined);
  const plan: ModelChecks["plan"] = async (scope) => {
    const scoped = scope.provider === undefined ? withAccount() : [scope.provider];
    return planChecks(
      {
        catalogue: deps.catalogue(),
        rows: readChecks(deps.db),
        offered: (await Promise.all(scoped.map(offered))).flat(),
        accounts: (id) => accountOf(deps.db, id),
        chosen: chosenModels(deps.db),
      },
      scope,
    );
  };
  const launch = (checks: CheckPlan): Promise<RunSummary> => {
    const owned = [...new Set(checks.targets.map((t) => t.provider))].filter(
      (id): id is ProviderId => (providerIds as readonly string[]).includes(id),
    );
    for (const id of owned) running.add(id);
    return runChecks(
      { db: deps.db, clock: deps.clock, log: deps.log, check: deps.check },
      checks,
      // A manual plan's estimate was confirmed in `start`; an automatic one is free or cheap.
      { confirmedDollars: checks.totalDollars, signal: stopping.signal },
    )
      .then((answer) =>
        answer.ok
          ? answer.summary
          : { checked: 0, works: 0, noAccess: 0, failed: 0, skipped: 0, spent: 0 },
      )
      .finally(() => {
        for (const id of owned) running.delete(id);
      });
  };
  const start: ModelChecks["start"] = async (scope, confirmedDollars) => {
    const scoped = scope.provider === undefined ? withAccount() : [scope.provider];
    const busy = scoped.filter((id) => running.has(id));
    if (busy.length > 0) return { ok: false, reason: "running", providers: busy };
    const checks = await plan(scope);
    if (scope.trigger === "manual" && needsConfirmation(checks, confirmedDollars))
      return { ok: false, reason: "estimate", plan: checks };
    return { ok: true, plan: checks, done: launch(checks) };
  };
  const automatic: ModelChecks["automatic"] = async (trigger, provider) => {
    const scoped = provider === undefined ? withAccount() : [provider];
    for (const id of scoped)
      await deps.listing.refresh(id, true).catch((error: unknown) => {
        deps.log.write("warn", "model-checks.listing", {
          detail: `${id}: ${error instanceof Error ? error.message : String(error)}`,
        });
      });
    if (readAuto(deps.db) === "off") return;
    const free = scoped.filter((id) => !running.has(id));
    if (free.length === 0) return;
    const checks = await plan(provider === undefined ? { trigger } : { trigger, provider });
    const kept = {
      ...checks,
      targets: checks.targets.filter((t) => free.some((id) => id === t.provider)),
    };
    if (trigger === "weekly") writeSetting(deps.db, weeklyAtKey, deps.clock.now().toISOString());
    if (kept.targets.length > 0) await launch(kept);
  };
  return {
    offered,
    plan,
    start,
    automatic,
    weeklyDue: () => {
      if (readAuto(deps.db) === "off") return false;
      const last = readSetting(deps.db, weeklyAtKey);
      return (
        last === undefined || deps.clock.now().getTime() - Date.parse(last) >= weeklyIntervalMs
      );
    },
    standings: (provider, models) => {
      const { family } = providerById(provider);
      const account = accountOf(deps.db, provider);
      const rows = new Map<string, ModelCheckRow>(
        readChecks(deps.db, provider)
          .filter((row) => row.family === family)
          .map((row) => [row.model, row]),
      );
      return Object.fromEntries(
        models.map((model) => [
          model.id,
          standingOf(
            rows.get(model.id),
            account,
            deps.retiring?.({ provider, family, model: model.id }),
          ),
        ]),
      );
    },
    overview: () => {
      const rows = readChecks(deps.db);
      const catalogue = deps.catalogue();
      const nameOf = (key: ModelKey): string =>
        catalogue[key.family].find((m) => m.provider === key.provider && m.id === key.model)
          ?.name ?? key.model;
      const states = providers.map((provider): ProviderCheckState => {
        const account = accountOf(deps.db, provider.id);
        const own = rows.filter((row) => row.provider === provider.id && row.account === account);
        const times = own.flatMap((row) => (row.checkedAt === null ? [] : [row.checkedAt])).sort();
        return {
          provider: provider.id,
          family: provider.family,
          running: running.has(provider.id),
          lastCheckedAt: times.at(-1) ?? null,
          spent: own.reduce((sum, row) => sum + row.cost, 0),
          works: own.filter((row) => row.verdict === "works").length,
          noAccess: own.filter((row) => row.verdict === "no-access").length,
          listed: own.filter((row) => row.listed === true).length,
        };
      });
      const current = rows.filter(
        (row) =>
          (providerIds as readonly string[]).includes(row.provider) &&
          row.account === accountOf(deps.db, row.provider as ProviderId),
      );
      return {
        auto: readAuto(deps.db),
        providers: states,
        newForYou: newForYou(current).map((row) => ({
          provider: row.provider,
          family: row.family,
          model: row.model,
          name: nameOf(row),
          firstWorksAt: row.firstWorksAt ?? "",
        })),
      };
    },
    running: () => [...running],
    stop: () => stopping.abort(),
  };
}
