import { nextOccurrence } from "../schedules/calendar.js";
import type { BackupConfig, BackupStatus, BackupTrigger } from "./model.js";

// After a start, the first backup waits this long so it never competes with the boot's own
// work (migrations, reconcile, the queue resuming).
export const startupDelayMs = 2 * 60_000;
// A failed backup is tried again this often until the slot's backup succeeds or the next slot.
export const retryAfterFailureMs = 60 * 60_000;
// A backup held back by projects being made looks again this often.
export const retryAfterWaitingMs = 10 * 60_000;
// A slot missed while Slopify was off is made up for after the next start, unless a backup
// already succeeded this recently ("about a day", with room for a slot that ran late).
export const catchUpFreshMs = 20 * 60 * 60_000;

export type BackupDecision =
  | { readonly due: true; readonly slot: string; readonly trigger: BackupTrigger }
  | {
      readonly due: false;
      readonly reason: "off" | "running" | "not-yet" | "done" | "starting" | "retry-later";
    };

export interface DecisionInput {
  readonly config: BackupConfig;
  readonly status: BackupStatus;
  readonly now: Date;
  readonly bootedAt: Date;
  readonly running: boolean;
}

// The most recent time-of-day slot at or before `now`, in the configured zone. Days are 23 to 25
// hours long, so 26 hours back always holds at least one slot.
export function latestSlot(time: string, timeZone: string, now: Date): Date | null {
  const daily = { kind: "daily", time } as const;
  let slot = nextOccurrence(daily, timeZone, new Date(now.valueOf() - 26 * 60 * 60_000));
  if (slot === null || slot > now) return null;
  for (;;) {
    const next = nextOccurrence(daily, timeZone, slot);
    if (next === null || next > now) return slot;
    slot = next;
  }
}

export function nextSlot(time: string, timeZone: string, now: Date): Date | null {
  return nextOccurrence({ kind: "daily", time }, timeZone, now);
}

// At most one automatic backup per daily slot. A slot is due once no backup has succeeded
// since it; a slot that passed while Slopify was off is caught up after the next start.
export function decideBackup(input: DecisionInput): BackupDecision {
  const { config, status, now, bootedAt } = input;
  if (!config.enabled) return { due: false, reason: "off" };
  if (input.running) return { due: false, reason: "running" };
  const slot = latestSlot(config.time, config.timeZone, now);
  if (slot === null) return { due: false, reason: "not-yet" };
  if (config.enabledAt !== null && slot.valueOf() < Date.parse(config.enabledAt))
    return { due: false, reason: "not-yet" };
  const lastSuccess = status.lastSuccessAt === null ? null : Date.parse(status.lastSuccessAt);
  if (lastSuccess !== null && lastSuccess >= slot.valueOf()) return { due: false, reason: "done" };
  const missed = bootedAt.valueOf() > slot.valueOf();
  if (missed && lastSuccess !== null && now.valueOf() - lastSuccess < catchUpFreshMs)
    return { due: false, reason: "done" };
  if (now.valueOf() - bootedAt.valueOf() < startupDelayMs)
    return { due: false, reason: "starting" };
  if (status.lastSlot === slot.toISOString() && status.lastAttemptAt !== null) {
    const wait =
      status.lastResult === "failed"
        ? retryAfterFailureMs
        : status.lastResult === "waiting"
          ? retryAfterWaitingMs
          : 0;
    if (now.valueOf() - Date.parse(status.lastAttemptAt) < wait)
      return { due: false, reason: "retry-later" };
  }
  return { due: true, slot: slot.toISOString(), trigger: missed ? "catch-up" : "scheduled" };
}
