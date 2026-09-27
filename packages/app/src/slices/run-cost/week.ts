import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  type LimitWindow,
  type PlanAccount,
  planAccountNames,
  planAccounts,
} from "../../kernel/ports/plan-limits.js";

// Home's "This week": how many videos were made since a moment, what the provider calls cost,
// what the plan-billed ones would have cost through the API, and where each CLI plan's windows
// stand now. Read from the same stored calls the Run cost tab reads; nothing is estimated.

export interface PlanStanding {
  readonly account: PlanAccount;
  readonly name: string;
  // The last reading the CLI gave, in percent of the window; null when it never reported one.
  readonly weeklyPercent: number | null;
  readonly fiveHourPercent: number | null;
  readonly weeklyResetsAt: string | null;
  readonly readAt: string;
}

export interface WeekSummary {
  readonly since: string;
  readonly videos: number;
  readonly calls: number;
  readonly cost: number;
  // Calls with no known price, counted rather than read as free.
  readonly unpriced: number;
  // What the plan-billed calls would have cost through the API; null when there were none.
  readonly apiEquivalent: number | null;
  readonly plans: readonly PlanStanding[];
}

const usageRow = z.object({
  project_id: z.string(),
  on_plan: z.number(),
  cost: z.number().nullable(),
  api_cost: z.number().nullable(),
});
const windowSchema = z.object({
  kind: z.enum(["five_hour", "weekly", "other"]),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
});
const readingSchema = z.object({
  before: z.array(windowSchema).optional(),
  after: z.array(windowSchema).optional(),
});

// `inScope` narrows the counts to one channel's projects; plan standings are the account's
// whole allowance, which every channel shares, so they are never narrowed.
export function weekSummary(
  db: DatabaseSync,
  since: string,
  inScope: (projectId: string) => boolean = () => true,
): WeekSummary {
  let calls = 0;
  let cost = 0;
  let unpriced = 0;
  let apiEquivalent: number | null = null;
  for (const raw of db
    .prepare("SELECT project_id, on_plan, cost, api_cost FROM provider_usage WHERE created_at >= ?")
    .all(since)) {
    const row = usageRow.parse(raw);
    if (!inScope(row.project_id)) continue;
    calls += 1;
    cost += row.cost ?? 0;
    if (row.cost === null) unpriced += 1;
    if (row.on_plan === 1) apiEquivalent = (apiEquivalent ?? 0) + (row.api_cost ?? 0);
  }
  // A video is made when its file lands; a remade video counts again, as it was made again.
  const videos = db
    .prepare("SELECT project_id FROM outputs WHERE role = 'video' AND created_at >= ?")
    .all(since)
    .filter((row) => inScope(String(row.project_id))).length;
  return { since, videos, calls, cost, unpriced, apiEquivalent, plans: planStandings(db) };
}

function planStandings(db: DatabaseSync): PlanStanding[] {
  return planAccounts.flatMap((account): PlanStanding[] => {
    const rows = db
      .prepare(
        "SELECT reading_json, created_at FROM plan_limit_readings WHERE account = ? ORDER BY created_at DESC, rowid DESC LIMIT 20",
      )
      .all(account);
    for (const raw of rows) {
      const row = z.object({ reading_json: z.string(), created_at: z.string() }).parse(raw);
      const parsed = readingSchema.safeParse(JSON.parse(row.reading_json));
      if (!parsed.success) continue;
      const windows: readonly LimitWindow[] = parsed.data.after?.length
        ? parsed.data.after
        : (parsed.data.before ?? []);
      if (windows.length === 0) continue;
      const weekly = windows.find((window) => window.kind === "weekly");
      const fiveHour = windows.find((window) => window.kind === "five_hour");
      return [
        {
          account,
          name: planAccountNames[account],
          weeklyPercent: weekly?.usedPercent ?? null,
          fiveHourPercent: fiveHour?.usedPercent ?? null,
          weeklyResetsAt: weekly?.resetsAt ?? null,
          readAt: row.created_at,
        },
      ];
    }
    return [];
  });
}
