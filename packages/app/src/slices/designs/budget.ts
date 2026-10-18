import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Log } from "../../kernel/log.js";
import { readJsonSetting } from "../settings/repo.js";

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
