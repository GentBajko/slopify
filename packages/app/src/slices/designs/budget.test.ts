import { expect, it } from "vitest";
import { fixedClock } from "../../kernel/clock.fake.js";
import { openDb } from "../../kernel/db/index.js";
import { migrate } from "../../kernel/db/migrate.js";
import { writeSetting } from "../settings/repo.js";
import { dailySampleBudget, dailySampleBudgetKey } from "./budget.js";

it("reads the daily sample budget, one dollar when unset or unreadable", () => {
  const db = openDb(":memory:");
  migrate(db, fixedClock("2026-10-18T10:00:00.000Z"));
  const log = { write: () => {} };
  expect(dailySampleBudget(db, log)).toBe(1);
  writeSetting(db, dailySampleBudgetKey, "2.5");
  expect(dailySampleBudget(db, log)).toBe(2.5);
  writeSetting(db, dailySampleBudgetKey, "-1");
  expect(dailySampleBudget(db, log)).toBe(1);
});
