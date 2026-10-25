import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { readJsonSetting } from "../settings/repo.js";
import { sampleSpentToday } from "./sample-repo.js";

// What a design template's samples may spend per day, in dollars, before the editor holds a
// sample for a person to start.
// No row is seeded: an absent row reads as the default, and only a changed budget travels in
// backups.
export const dailySampleBudgetKey = "designs.dailySampleBudget";
export const dailySampleBudgetSchema = z.number().min(0).max(1000);
export const defaultDailySampleBudget = 1;

export function dailySampleBudget(db: DatabaseSync, log?: Pick<Log, "write">): number {
  return readJsonSetting(
    db,
    dailySampleBudgetKey,
    dailySampleBudgetSchema,
    defaultDailySampleBudget,
    log,
  );
}

export function budgetSentence(total: number, budget: number): string {
  return `Waiting: this sample would take today's sample spending to $${total.toFixed(2)}, over the $${budget.toFixed(2)} a day samples may spend. Press Make sample to make it anyway; the limit starts again at midnight.`;
}

// Settings → Production defaults shows it beside the budget: what design samples spent since local
// midnight and what is left of today's budget.
export function designBudgetRoom(
  db: DatabaseSync,
  now: Date,
  timeZone: string,
): { readonly budget: number; readonly spent: number; readonly left: number } {
  const budget = dailySampleBudget(db);
  const spent = sampleSpentToday(db, now, timeZone);
  return { budget, spent, left: Math.max(0, budget - spent) };
}
