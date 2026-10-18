import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import {
  type PlanAccount,
  planAccountNames,
  planAccountOf,
  planAccounts,
} from "../../kernel/ports/plan-limits.js";
import {
  type AccountCall,
  beforeGapMs,
  type CallReading,
  type PlanWindowUse,
  windowUse,
} from "./plan-use.js";

export interface PlanUse {
  readonly account: PlanAccount;
  readonly name: string;
  readonly calls: number;
  // False when the CLI reported no windows at all for this run (e.g. through the Docker
  // host bridge): the tab says so rather than guessing.
  readonly reported: boolean;
  readonly windows: readonly PlanWindowUse[];
}

const windowSchema = z.object({
  kind: z.enum(["five_hour", "weekly", "other"]),
  usedPercent: z.number(),
  resetsAt: z.string().nullable(),
});
// `usageId` names the call's provider_usage row; readings stored before it was kept lack it.
export const readingSchema = z.object({
  before: z.array(windowSchema).optional(),
  after: z.array(windowSchema).optional(),
  usageId: z.string().optional(),
});

const callRow = z.object({
  id: z.string(),
  provider: z.string(),
  tokens_in: z.number().nullable(),
  tokens_out: z.number().nullable(),
  wall_ms: z.number(),
  created_at: z.string(),
});
const readingRow = z.object({
  id: z.string(),
  account: z.string().nullable(),
  reading_json: z.string().nullable(),
  created_at: z.string(),
});

function callOf(row: z.infer<typeof callRow>): AccountCall {
  const endMs = Date.parse(row.created_at);
  return {
    id: row.id,
    startMs: endMs - row.wall_ms,
    endMs,
    tokens:
      row.tokens_in === null && row.tokens_out === null
        ? null
        : (row.tokens_in ?? 0) + (row.tokens_out ?? 0),
  };
}

function parseReading(json: string | null): z.infer<typeof readingSchema> | undefined {
  if (json === null) return undefined;
  const parsed = readingSchema.safeParse(JSON.parse(json));
  return parsed.success ? parsed.data : undefined;
}

function readingOf(
  stored: z.infer<typeof readingSchema>,
  usageId: string | undefined,
  createdAt: string,
  calls: ReadonlyMap<string, AccountCall>,
): CallReading {
  const call = usageId === undefined ? undefined : calls.get(usageId);
  const at = Date.parse(createdAt);
  return {
    usageId: call === undefined ? null : call.id,
    startMs: call?.startMs ?? at,
    endMs: call?.endMs ?? at,
    tokens: call?.tokens ?? null,
    before: stored.before,
    after: stored.after,
  };
}

export function planUses(
  db: DatabaseSync,
  projectId: string,
  providers: readonly string[],
): PlanUse[] {
  const ownCalls = db
    .prepare(
      "SELECT id, provider, tokens_in, tokens_out, wall_ms, created_at FROM provider_usage WHERE project_id = ?",
    )
    .all(projectId)
    .map((row) => callRow.parse(row));
  const ownReadings = db
    .prepare(
      "SELECT id, account, reading_json, created_at FROM plan_limit_readings WHERE project_id = ? ORDER BY created_at, rowid",
    )
    .all(projectId)
    .map((row) => readingRow.parse(row));
  return planAccounts.flatMap((account): PlanUse[] => {
    const calls = providers.filter((provider) => planAccountOf(provider) === account).length;
    if (calls === 0) return [];
    const mine = ownReadings.filter((row) => row.account === account);
    const activity = accountActivity(db, account, ownCalls, projectId);
    const own = mine.flatMap((row): CallReading[] => {
      const stored = parseReading(row.reading_json);
      if (stored === undefined || (!stored.before?.length && !stored.after?.length)) return [];
      return [readingOf(stored, stored.usageId, row.created_at, activity.byId)];
    });
    return [
      {
        account,
        name: planAccountNames[account],
        calls,
        reported: own.length > 0,
        windows: windowUse(own, {
          calls: [...activity.byId.values()],
          readings: activity.readings,
        }),
      },
    ];
  });
}

// Every call on the account from when this project's first call began (less the gap an
// after-only call may look back), from any project or schedule.
function accountActivity(
  db: DatabaseSync,
  account: PlanAccount,
  ownCalls: readonly z.infer<typeof callRow>[],
  projectId: string,
): { byId: ReadonlyMap<string, AccountCall>; readings: readonly CallReading[] } {
  const starts = ownCalls.map((row) => callOf(row).startMs);
  const byId = new Map<string, AccountCall>();
  if (starts.length === 0) return { byId, readings: [] };
  const since = new Date(Math.min(...starts) - beforeGapMs).toISOString();
  const projectCalls = db
    .prepare(
      "SELECT id, provider, tokens_in, tokens_out, wall_ms, created_at FROM provider_usage WHERE created_at >= ?",
    )
    .all(since)
    .map((row) => callRow.parse(row));
  const standalone = db
    .prepare(
      "SELECT id, provider, tokens_in, tokens_out, wall_ms, created_at, account, reading_json FROM standalone_usage WHERE created_at >= ?",
    )
    .all(since);
  for (const row of [...projectCalls, ...standalone.map((raw) => callRow.parse(raw))])
    if (planAccountOf(row.provider) === account) byId.set(row.id, callOf(row));
  const readings: CallReading[] = [];
  for (const raw of db
    .prepare(
      "SELECT id, account, reading_json, created_at FROM plan_limit_readings WHERE account = ? AND project_id != ? AND created_at >= ?",
    )
    .all(account, projectId, since)) {
    const row = readingRow.parse(raw);
    const stored = parseReading(row.reading_json);
    if (stored !== undefined)
      readings.push(readingOf(stored, stored.usageId, row.created_at, byId));
  }
  for (const raw of standalone) {
    const row = readingRow.parse(raw);
    const stored = row.account === account ? parseReading(row.reading_json) : undefined;
    if (stored !== undefined) readings.push(readingOf(stored, row.id, row.created_at, byId));
  }
  return { byId, readings };
}
