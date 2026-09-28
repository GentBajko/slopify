import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { type StageKind, stageKinds } from "../../kernel/pipeline.js";
import {
  type LimitWindow,
  type PlanAccount,
  planAccountNames,
  planAccountOf,
  planAccounts,
} from "../../kernel/ports/plan-limits.js";
import type { ListingLimitWait } from "../admission/model.js";
import { projectTiming, type RunTiming } from "./timing.js";

// The data behind a project's Run cost tab: what the run actually cost, per stage and per
// model, what its CLI calls would have cost through the API, the usage behind both, and how
// much of each CLI plan's windows the run took. Computed from the stored calls only.

export interface UsageTotals {
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly cachedTokens: number;
  readonly characters: number;
  readonly images: number;
  readonly seconds: number;
}

export interface CostLine {
  readonly calls: number;
  // Known spend in USD; calls with no price are counted in `unpriced`, never as zero.
  readonly cost: number;
  readonly unpriced: number;
  // What the plan-billed calls would have cost through the API; null when there were none.
  readonly apiEquivalent: number | null;
  readonly apiUnpriced: number;
}

export interface StageCost extends CostLine, UsageTotals {
  readonly stage: StageKind;
  // The time the stage's steps spent running, over every run; null while it has not run.
  readonly wallMs: number | null;
}

export interface ModelCost extends CostLine, UsageTotals {
  readonly provider: string;
  readonly model: string;
  readonly kind: "llm" | "tts" | "image" | "video";
  readonly onPlan: boolean;
  readonly apiModel: string | null;
}

export interface PlanWindowUse {
  readonly kind: LimitWindow["kind"];
  // How many percentage points of the window the run took, as the CLI's own readings show.
  readonly usedPercent: number;
  // The window's reading after the run's last call.
  readonly nowPercent: number;
  readonly resetsAt: string | null;
}

export interface PlanUse {
  readonly account: PlanAccount;
  readonly name: string;
  readonly calls: number;
  // False when the CLI reported no windows at all for this run (e.g. through the Docker
  // host bridge): the tab says so rather than guessing.
  readonly reported: boolean;
  readonly windows: readonly PlanWindowUse[];
}

export interface LimitWait {
  readonly account: PlanAccount;
  readonly name: string;
  readonly stage: StageKind;
  readonly resetsAt: string | null;
  readonly retryAt: string;
}

export interface RunCost extends CostLine {
  readonly currency: "USD";
  // The time some step was running, over every run (`timing.ts`).
  readonly totals: UsageTotals & { readonly wallMs: number };
  // The latest run's working time; null before anything ran.
  readonly run: RunTiming | null;
  readonly byStage: readonly StageCost[];
  readonly byModel: readonly ModelCost[];
  readonly plans: readonly PlanUse[];
  readonly waits: readonly LimitWait[];
  readonly catalogueDate: string | null;
}

const usageRow = z.object({
  stage: z.enum(stageKinds),
  kind: z.enum(["llm", "tts", "image", "video"]),
  provider: z.string(),
  model: z.string(),
  tokens_in: z.number().nullable(),
  tokens_out: z.number().nullable(),
  tokens_cached: z.number().nullable(),
  characters: z.number().nullable(),
  images: z.number().nullable(),
  seconds: z.number().nullable(),
  on_plan: z.number(),
  cost: z.number().nullable(),
  api_model: z.string().nullable(),
  api_cost: z.number().nullable(),
  price_json: z.string().nullable(),
});
type UsageRow = z.infer<typeof usageRow>;

const windowSchema = z.object({
  kind: z.enum(["five_hour", "weekly", "other"]),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
});
const readingSchema = z.object({
  before: z.array(windowSchema).optional(),
  after: z.array(windowSchema).optional(),
});

const emptyTotals: UsageTotals = {
  tokensIn: 0,
  tokensOut: 0,
  cachedTokens: 0,
  characters: 0,
  images: 0,
  seconds: 0,
};
const emptyLine: CostLine = {
  calls: 0,
  cost: 0,
  unpriced: 0,
  apiEquivalent: null,
  apiUnpriced: 0,
};

function add<T extends CostLine & UsageTotals>(into: T, row: UsageRow): T {
  const onPlan = row.on_plan === 1;
  return {
    ...into,
    calls: into.calls + 1,
    cost: into.cost + (row.cost ?? 0),
    unpriced: into.unpriced + (row.cost === null ? 1 : 0),
    apiEquivalent: onPlan ? (into.apiEquivalent ?? 0) + (row.api_cost ?? 0) : into.apiEquivalent,
    apiUnpriced: into.apiUnpriced + (onPlan && row.api_cost === null ? 1 : 0),
    tokensIn: into.tokensIn + (row.tokens_in ?? 0),
    tokensOut: into.tokensOut + (row.tokens_out ?? 0),
    cachedTokens: into.cachedTokens + (row.tokens_cached ?? 0),
    characters: into.characters + (row.characters ?? 0),
    images: into.images + (row.images ?? 0),
    seconds: into.seconds + (row.seconds ?? 0),
  };
}

export function runCostOf(db: DatabaseSync, projectId: string, now = Date.now()): RunCost {
  const rows = db
    .prepare(
      "SELECT stage, kind, provider, model, tokens_in, tokens_out, tokens_cached, characters, images, seconds, on_plan, cost, api_model, api_cost, price_json FROM provider_usage WHERE project_id = ? ORDER BY created_at, rowid",
    )
    .all(projectId)
    .map((row) => usageRow.parse(row));

  const timing = projectTiming(db, projectId, now);
  const walls = timing.byStage;
  const stages = new Map<StageKind, StageCost>();
  const models = new Map<string, ModelCost>();
  let total: CostLine & UsageTotals = { ...emptyLine, ...emptyTotals };
  let catalogueDate: string | null = null;
  for (const row of rows) {
    total = add(total, row);
    stages.set(
      row.stage,
      add(
        stages.get(row.stage) ?? {
          stage: row.stage,
          wallMs: walls.get(row.stage) ?? null,
          ...emptyLine,
          ...emptyTotals,
        },
        row,
      ),
    );
    const key = JSON.stringify([row.provider, row.model, row.kind]);
    models.set(
      key,
      add(
        models.get(key) ?? {
          provider: row.provider,
          model: row.model,
          kind: row.kind,
          onPlan: row.on_plan === 1,
          apiModel: row.api_model,
          ...emptyLine,
          ...emptyTotals,
        },
        row,
      ),
    );
    catalogueDate = catalogueOf(row.price_json) ?? catalogueDate;
  }
  // A stage that ran with no provider call (a render, a document) still has its time.
  for (const [stage, wallMs] of walls)
    if (!stages.has(stage)) stages.set(stage, { stage, wallMs, ...emptyLine, ...emptyTotals });

  const plans = planUses(db, projectId, rows);
  return {
    currency: "USD",
    ...total,
    totals: {
      tokensIn: total.tokensIn,
      tokensOut: total.tokensOut,
      cachedTokens: total.cachedTokens,
      characters: total.characters,
      images: total.images,
      seconds: total.seconds,
      wallMs: timing.workingMs,
    },
    run: timing.run,
    byStage: stageKinds.flatMap((kind) => {
      const found = stages.get(kind);
      return found === undefined ? [] : [found];
    }),
    byModel: [...models.values()].toSorted(
      (left, right) =>
        right.cost - left.cost ||
        (right.apiEquivalent ?? 0) - (left.apiEquivalent ?? 0) ||
        left.provider.localeCompare(right.provider) ||
        left.model.localeCompare(right.model),
    ),
    plans,
    waits: limitWaitsOf(db, projectId),
    catalogueDate,
  };
}

function catalogueOf(json: string | null): string | null {
  if (json === null) return null;
  const parsed = z.object({ catalogue: z.string() }).safeParse(JSON.parse(json));
  return parsed.success ? parsed.data.catalogue : null;
}

// Two readings belong to the same window when their resets agree to within a few minutes;
// a reset moving on means the window rolled over between them.
const sameWindowMs = 5 * 60_000;

export function windowUse(readings: readonly (readonly LimitWindow[])[]): PlanWindowUse[] {
  const byKind = new Map<LimitWindow["kind"], LimitWindow[]>();
  for (const reading of readings)
    for (const window of reading)
      byKind.set(window.kind, [...(byKind.get(window.kind) ?? []), window]);
  const uses: PlanWindowUse[] = [];
  for (const [kind, seen] of byKind) {
    let used = 0;
    for (let at = 1; at < seen.length; at += 1) {
      const previous = seen[at - 1];
      const current = seen[at];
      if (previous === undefined || current === undefined) continue;
      const same =
        previous.resetsAt === current.resetsAt ||
        (previous.resetsAt !== null &&
          current.resetsAt !== null &&
          Math.abs(Date.parse(previous.resetsAt) - Date.parse(current.resetsAt)) < sameWindowMs);
      used += same ? Math.max(0, current.usedPercent - previous.usedPercent) : current.usedPercent;
    }
    const last = seen.at(-1);
    if (last !== undefined)
      uses.push({ kind, usedPercent: used, nowPercent: last.usedPercent, resetsAt: last.resetsAt });
  }
  const order: readonly LimitWindow["kind"][] = ["five_hour", "weekly", "other"];
  return uses.toSorted((left, right) => order.indexOf(left.kind) - order.indexOf(right.kind));
}

function planUses(db: DatabaseSync, projectId: string, rows: readonly UsageRow[]): PlanUse[] {
  const readings = db
    .prepare(
      "SELECT account, reading_json FROM plan_limit_readings WHERE project_id = ? ORDER BY created_at, rowid",
    )
    .all(projectId)
    .map((row) => z.object({ account: z.string(), reading_json: z.string() }).parse(row));
  return planAccounts.flatMap((account): PlanUse[] => {
    const calls = rows.filter((row) => planAccountOf(row.provider) === account).length;
    if (calls === 0) return [];
    const sequence: LimitWindow[][] = [];
    for (const row of readings) {
      if (row.account !== account) continue;
      const parsed = readingSchema.safeParse(JSON.parse(row.reading_json));
      if (!parsed.success) continue;
      if (parsed.data.before?.length) sequence.push(parsed.data.before);
      if (parsed.data.after?.length) sequence.push(parsed.data.after);
    }
    return [
      {
        account,
        name: planAccountNames[account],
        calls,
        reported: sequence.length > 0,
        windows: windowUse(sequence),
      },
    ];
  });
}

export function limitWaitsOf(db: DatabaseSync, projectId: string): LimitWait[] {
  return limitWaitRows(db, projectId).map((row) => row.wait);
}

// Every project's waits at once, for the lists that show "Waiting for Codex limits" on a row
// (Projects, Home's Running now, the calendar) without asking once per project.
export function limitWaitsByProject(db: DatabaseSync): ReadonlyMap<string, readonly LimitWait[]> {
  const found = new Map<string, LimitWait[]>();
  for (const row of limitWaitRows(db)) {
    const list = found.get(row.projectId) ?? [];
    list.push(row.wait);
    found.set(row.projectId, list);
  }
  return found;
}

// A wait as a list row carries it: the plan's name and times, not its account key.
export function listingWait(wait: LimitWait): ListingLimitWait {
  return { name: wait.name, stage: wait.stage, resetsAt: wait.resetsAt, retryAt: wait.retryAt };
}

function limitWaitRows(
  db: DatabaseSync,
  projectId?: string,
): { readonly projectId: string; readonly wait: LimitWait }[] {
  // Only a stage still running is waiting: a row left by a cancel or pause is not shown.
  return db
    .prepare(
      `SELECT w.project_id, w.account, w.stage, l.resets_at, l.retry_at FROM plan_limit_waiters w
       JOIN plan_limit_waits l ON l.account = w.account
       JOIN stages s ON s.project_id = w.project_id AND s.kind = w.stage AND s.state = 'running'
       ${projectId === undefined ? "" : "WHERE w.project_id = ?"} ORDER BY w.since`,
    )
    .all(...(projectId === undefined ? [] : [projectId]))
    .map((raw) => {
      const row = z
        .object({
          project_id: z.string(),
          account: z.enum(planAccounts),
          stage: z.enum(stageKinds),
          resets_at: z.string().nullable(),
          retry_at: z.string(),
        })
        .parse(raw);
      return {
        projectId: row.project_id,
        wait: {
          account: row.account,
          name: planAccountNames[row.account],
          stage: row.stage,
          resetsAt: row.resets_at,
          retryAt: row.retry_at,
        },
      };
    });
}
