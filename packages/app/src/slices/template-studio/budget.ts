import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readJsonSetting, writeSetting } from "../settings/repo.js";

// Settings → Template studio: the most the studio's samples may spend in one day, in dollars,
// and whether they may use a CLI plan at all. Plan usage has no dollar price, so the budget
// can't hold it back: samples that run on a CLI plan wait until the person turns that on. With
// both at their defaults ($0 and plans off) no sample spends anything. A sample that would go
// over either waits, saying so, until the next day, a higher budget or plans allowed.

export const dailyBudgetKey = "templateStudio.dailyBudget";
export const samplesUsePlansKey = "templateStudio.samplesUsePlans";
export const defaultDailyBudget = 2;
export const dailyBudgetMax = 1000;

export const studioSettingsSchema = z
  .object({
    dailyBudget: z.number().finite().min(0).max(dailyBudgetMax),
    // Left out, the stored choice stays.
    samplesUsePlans: z.boolean().optional(),
  })
  .strict()
  .readonly();

export interface StudioSettings {
  readonly dailyBudget: number;
  readonly samplesUsePlans: boolean;
}

export function readStudioSettings(db: DatabaseSync): StudioSettings {
  return {
    dailyBudget: readJsonSetting(
      db,
      dailyBudgetKey,
      z.number().finite().min(0).max(dailyBudgetMax),
      defaultDailyBudget,
    ),
    samplesUsePlans: readJsonSetting(db, samplesUsePlansKey, z.boolean(), false),
  };
}

export function writeStudioSettings(
  db: DatabaseSync,
  settings: z.infer<typeof studioSettingsSchema>,
): StudioSettings {
  const rounded = Math.round(settings.dailyBudget * 100) / 100;
  writeSetting(db, dailyBudgetKey, JSON.stringify(rounded));
  if (settings.samplesUsePlans !== undefined)
    writeSetting(db, samplesUsePlansKey, JSON.stringify(settings.samplesUsePlans));
  return readStudioSettings(db);
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
  // Whether samples may run on a CLI plan (Samples may use my CLI plans).
  readonly plans: boolean;
}

export function budgetRoom(db: DatabaseSync, now: Date, timeZone = systemTimeZone()): BudgetRoom {
  const { dailyBudget, samplesUsePlans } = readStudioSettings(db);
  const spent = spentToday(db, now, timeZone);
  return {
    budget: dailyBudget,
    spent,
    left: Math.max(0, dailyBudget - spent),
    plans: samplesUsePlans,
  };
}

// Whether a sample of about `high` dollars, `usesPlan` when a step runs on a CLI plan, may
// start on what is left of today's budget.
export function fitsBudget(room: BudgetRoom, high: number, usesPlan = false): boolean {
  if (usesPlan && !room.plans) return false;
  return high <= room.left + 1e-9;
}

const money = (value: number) => `$${value.toFixed(2)}`;

// Why a sample that doesn't fit (`fitsBudget`) waits, and what lets it start, as one sentence
// (no full stop) about `subject`: "This sample", "Comparing".
export function budgetWords(
  room: BudgetRoom,
  cost: { readonly high: number; readonly usesPlan: boolean },
  subject: string,
): string {
  if (cost.usesPlan && !room.plans)
    return `${subject} runs on your CLI plan, and samples may not use CLI plans. Turn on Samples may use my CLI plans in Settings → Template studio`;
  return `${subject} costs about ${money(cost.high)} and ${money(room.left)} of today's ${money(room.budget)} sample budget is left. Raise the budget in Settings → Template studio`;
}
