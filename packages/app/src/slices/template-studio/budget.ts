import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readJsonSetting, writeSetting } from "../settings/repo.js";

// Settings → Template studio: the most the studio's samples may spend in one day. A sample that
// would go over it waits, saying so, until the next day or a higher budget.

export const dailyBudgetKey = "templateStudio.dailyBudget";
export const defaultDailyBudget = 2;
export const dailyBudgetMax = 1000;

export const studioSettingsSchema = z
  .object({ dailyBudget: z.number().finite().min(0).max(dailyBudgetMax) })
  .strict()
  .readonly();
export type StudioSettings = z.infer<typeof studioSettingsSchema>;

export function readStudioSettings(db: DatabaseSync): StudioSettings {
  return {
    dailyBudget: readJsonSetting(
      db,
      dailyBudgetKey,
      z.number().finite().min(0).max(dailyBudgetMax),
      defaultDailyBudget,
    ),
  };
}

export function writeStudioSettings(db: DatabaseSync, settings: StudioSettings): StudioSettings {
  const rounded = Math.round(settings.dailyBudget * 100) / 100;
  writeSetting(db, dailyBudgetKey, JSON.stringify(rounded));
  return { dailyBudget: rounded };
}

// The instant today began on this computer's clock, in `timeZone`.
export function localMidnight(now: Date, timeZone: string): Date {
  const day = Temporal.Instant.fromEpochMilliseconds(now.valueOf())
    .toZonedDateTimeISO(timeZone)
    .startOfDay();
  return new Date(day.epochMilliseconds);
}

export function systemTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// What the studio's samples were charged since local midnight: the priced calls of every
// template's sample project and every bake-off copy, billed per use (a CLI plan's calls add
// nothing), and what such a project spent before it was removed. Other projects' calls never
// count.
export function spentToday(db: DatabaseSync, now: Date, timeZone = systemTimeZone()): number {
  const since = localMidnight(now, timeZone).toISOString();
  const row = db
    .prepare(
      `SELECT COALESCE((SELECT SUM(u.cost) FROM provider_usage u
         WHERE u.project_id IN (SELECT project_id FROM template_hidden_projects)
           AND u.on_plan = 0 AND u.created_at >= ?), 0)
       + COALESCE((SELECT SUM(cost) FROM template_studio_spend WHERE created_at >= ?), 0) AS spent`,
    )
    .get(since, since);
  return z.object({ spent: z.number() }).parse(row).spent;
}

export interface BudgetRoom {
  readonly budget: number;
  readonly spent: number;
  readonly left: number;
}

export function budgetRoom(db: DatabaseSync, now: Date, timeZone = systemTimeZone()): BudgetRoom {
  const { dailyBudget } = readStudioSettings(db);
  const spent = spentToday(db, now, timeZone);
  return { budget: dailyBudget, spent, left: Math.max(0, dailyBudget - spent) };
}

// Whether a sample of about `high` dollars fits what is left of today's budget.
export function fitsBudget(room: BudgetRoom, high: number): boolean {
  return high <= room.left + 1e-9;
}
