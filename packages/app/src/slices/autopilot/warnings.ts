import {
  type AutopilotWarning,
  diskLowBytes,
  diskLowShare,
  fewTopicsLeft,
  lowPercent,
} from "./model.js";

export type CliLogin = "signed-in" | "signed-out" | "unknown";

// What the warnings are read from: the probes' last answers (a CLI's sign-in, the OpenRouter
// key, the disk) and the database's now.
export interface AutopilotSignals {
  // Only the CLIs an active schedule's template or topic finding uses.
  readonly clis: readonly {
    readonly id: string;
    readonly name: string;
    readonly signIn: string;
    readonly login: CliLogin;
  }[];
  readonly plans: readonly {
    readonly name: string;
    readonly weeklyPercent: number | null;
    readonly fiveHourPercent: number | null;
  }[];
  // The OpenRouter key's spending limit and what is left of it; null with no limit, no key or
  // no answer.
  readonly openRouter: { readonly limit: number; readonly remaining: number } | null;
  readonly disk: { readonly freeBytes: number; readonly totalBytes: number } | null;
  readonly schedules: readonly {
    readonly id: string;
    readonly name: string;
    readonly paused: boolean;
    readonly queued: number;
    readonly generation: "off" | "queue" | "hold";
    readonly topicsError: string | null;
    // The template's name when the schedule's runs are skipped because its template has no
    // version it may run (`template-studio/schedule-gate.ts`); null otherwise.
    readonly notReadyTemplate: string | null;
  }[];
  readonly retired: readonly {
    readonly kind: "template" | "schedule";
    readonly id: string;
    readonly name: string;
    readonly slot: string;
    readonly model: string;
    readonly why: "retired" | "unlisted";
    readonly replacement: string | null;
  }[];
}

const gb = (bytes: number) => `${(bytes / 1024 ** 3).toFixed(1)} GB`;
const dollars = (value: number) => `$${value.toFixed(2)}`;

// Each warning says what is wrong, why it stops the autopilot, and where the fix is. A
// warning hidden with Hide stays hidden until its snooze ends.
export function warningsOf(
  signals: AutopilotSignals,
  snoozes: ReadonlyMap<string, string>,
  now: Date,
): readonly AutopilotWarning[] {
  const found: AutopilotWarning[] = [];
  for (const cli of signals.clis)
    if (cli.login === "signed-out")
      found.push({
        key: `cli-signed-out:${cli.id}`,
        severity: "problem",
        text: `${cli.name} is signed out, so scheduled runs that use it will fail. Open a terminal on this computer, run "${cli.signIn}" and sign in.`,
        fix: { kind: "settings", section: "providers", label: "Open Providers" },
      });
  for (const plan of signals.plans) {
    const weekly = plan.weeklyPercent ?? 0;
    const fiveHour = plan.fiveHourPercent ?? 0;
    if (weekly < lowPercent && fiveHour < lowPercent) continue;
    const window = weekly >= fiveHour ? "weekly" : "5-hour";
    found.push({
      key: `plan-low:${plan.name}`,
      severity: "warning",
      text: `${plan.name} has used ${String(Math.round(Math.max(weekly, fiveHour)))}% of its ${window} limit, so scheduled runs on it may wait until the limit resets. Check when it resets, or move a template to another provider.`,
      fix: { kind: "settings", section: "usage", label: "See plan usage" },
    });
  }
  const key = signals.openRouter;
  if (key !== null && key.limit > 0 && key.remaining / key.limit < 1 - lowPercent / 100)
    found.push({
      key: "openrouter-low",
      severity: key.remaining <= 0 ? "problem" : "warning",
      text: `Your OpenRouter key has ${dollars(Math.max(0, key.remaining))} left of its ${dollars(key.limit)} limit, so runs that use OpenRouter stop when it runs out. Raise the key's limit or add credit on openrouter.ai.`,
      fix: { kind: "settings", section: "providers", label: "Open Providers" },
    });
  const disk = signals.disk;
  if (
    disk !== null &&
    (disk.freeBytes < diskLowBytes ||
      (disk.totalBytes > 0 && disk.freeBytes / disk.totalBytes < diskLowShare))
  )
    found.push({
      key: "disk-low",
      severity: disk.freeBytes < diskLowBytes ? "problem" : "warning",
      text: `Only ${gb(disk.freeBytes)} is free on the disk Slopify saves to, so renders and downloads may fail. Free some space, or delete old versions and empty the Trash in Settings → Backup & storage.`,
      fix: { kind: "settings", section: "storage", label: "Open Backup & storage" },
    });
  for (const schedule of signals.schedules) {
    if (schedule.paused) continue;
    if (schedule.notReadyTemplate !== null)
      found.push({
        key: `template-not-ready:${schedule.id}`,
        severity: "problem",
        text: `“${schedule.name}” skips its runs because its template “${schedule.notReadyTemplate}” has no version approved for schedules. Open it from Templates with Edit template, then choose More → Approve for schedules.`,
        fix: { kind: "templates", label: "Open Templates" },
      });
    if (schedule.topicsError !== null && schedule.generation !== "off")
      found.push({
        key: `topics-failing:${schedule.id}`,
        severity: "problem",
        text: `“${schedule.name}” couldn't find new topics: ${schedule.topicsError} Its queue won't refill until that is fixed. Open the schedule, fix what the error says, then find topics again.`,
        fix: { kind: "schedule", scheduleId: schedule.id, label: "Open the schedule" },
      });
    if (schedule.generation === "off" && schedule.queued > 0 && schedule.queued < fewTopicsLeft)
      found.push({
        key: `few-topics:${schedule.id}:${String(schedule.queued)}`,
        severity: "warning",
        text: `“${schedule.name}” has ${schedule.queued === 1 ? "1 topic" : `${String(schedule.queued)} topics`} left and doesn't find new ones, so it stops after ${schedule.queued === 1 ? "its next run" : `its next ${String(schedule.queued)} runs`}. Add topics to its queue, or turn on topic generation.`,
        fix: { kind: "schedule", scheduleId: schedule.id, label: "Open the schedule" },
      });
  }
  for (const use of signals.retired)
    found.push({
      key: `retired:${use.kind}:${use.id}:${use.model}`,
      severity: "warning",
      text: `The ${use.slot.toLowerCase()} “${use.model}” in ${use.kind} “${use.name}” is ${use.why === "retired" ? "being retired" : "no longer offered"}, so its runs will fail once it is gone. Switch it to ${use.replacement === null ? "another model" : `“${use.replacement}”`}.`,
      fix:
        use.kind === "schedule"
          ? { kind: "schedule", scheduleId: use.id, label: "Open the schedule" }
          : { kind: "templates", label: "Open Templates" },
    });
  const at = now.toISOString();
  return found
    .filter((warning) => (snoozes.get(warning.key) ?? "") <= at)
    .toSorted((a, b) => Number(b.severity === "problem") - Number(a.severity === "problem"));
}
