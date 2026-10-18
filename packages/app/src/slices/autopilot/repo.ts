import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { readJsonSetting, writeSetting } from "../settings/repo.js";

const weeklyNotifyKey = "autopilot.weekly-notify";
const weeklySentKey = "autopilot.weekly-sent-for";

// The hidden warnings still hidden at `now`; ended ones are removed as they are read.
export function readSnoozes(db: DatabaseSync, now: Date): ReadonlyMap<string, string> {
  const at = now.toISOString();
  db.prepare("DELETE FROM autopilot_snoozes WHERE until<=?").run(at);
  return new Map(
    db
      .prepare("SELECT warning_key, until FROM autopilot_snoozes")
      .all()
      .map((row) => {
        const parsed = z.object({ warning_key: z.string(), until: z.string() }).parse(row);
        return [parsed.warning_key, parsed.until] as const;
      }),
  );
}

export function snoozeWarning(db: DatabaseSync, key: string, until: Date): void {
  db.prepare(
    "INSERT INTO autopilot_snoozes(warning_key, until) VALUES (?,?) ON CONFLICT(warning_key) DO UPDATE SET until=excluded.until",
  ).run(key, until.toISOString());
}

// Settings → Notifications' Weekly report. Off unless the person turned it on.
export function weeklyNotifyOf(db: DatabaseSync): boolean {
  return readJsonSetting(db, weeklyNotifyKey, z.boolean(), false);
}

export function setWeeklyNotify(db: DatabaseSync, enabled: boolean): void {
  writeSetting(db, weeklyNotifyKey, JSON.stringify(enabled));
}

// The ISO week the last report was sent for ("2026-W42").
export function weeklySentFor(db: DatabaseSync): string | undefined {
  const week = readJsonSetting(db, weeklySentKey, z.string(), null);
  return week ?? undefined;
}

export function markWeeklySent(db: DatabaseSync, week: string): void {
  writeSetting(db, weeklySentKey, JSON.stringify(week));
}
