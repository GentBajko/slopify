// Autopilot health: how far ahead the schedules' content is, and what is about to stop them
// (a CLI signed out, a plan or key running low, the disk filling, a queue of topics running
// out, topic generation failing, a model retiring). Browser-safe: Home reads these shapes.

export type TopicGenerationMode = "off" | "queue" | "hold";

export interface ScheduleForecast {
  readonly scheduleId: string;
  readonly name: string;
  readonly paused: boolean;
  // Topics waiting in the schedule's queue.
  readonly queued: number;
  readonly generating: TopicGenerationMode;
  // The first run that would have no topic to make; null while it never runs out (it finds its
  // own topics, or runs its template as saved) or is paused.
  readonly runsDryAt: string | null;
  readonly generationFailing: boolean;
}

export interface BufferForecast {
  // Finished videos not uploaded yet, plus runs made ahead (Prepare).
  readonly readyCount: number;
  // Days from now to the first scheduled run no ready video covers; null with no runs ahead.
  readonly daysAhead: number | null;
  // The last run the ready videos cover; null when they cover none.
  readonly coveredUntil: string | null;
  // The earliest a schedule runs dry, over every schedule.
  readonly runsDryAt: string | null;
  // True when every run in the forecast's window is covered: `daysAhead` is then a floor.
  readonly coveredBeyondWindow: boolean;
  readonly perSchedule: readonly ScheduleForecast[];
}

// Where a warning's fix is: a Settings section, a schedule, or the templates list.
export type WarningFix =
  | {
      readonly kind: "settings";
      readonly section: "providers" | "usage" | "storage";
      readonly label: string;
    }
  | { readonly kind: "schedule"; readonly scheduleId: string; readonly label: string }
  | { readonly kind: "templates"; readonly label: string };

export interface AutopilotWarning {
  // Stable for the same problem, so Hide keeps it hidden until it changes or the week is up.
  readonly key: string;
  readonly severity: "problem" | "warning";
  readonly text: string;
  readonly fix: WarningFix;
}

export interface FailedRun {
  readonly projectId: string;
  readonly title: string;
  readonly stage: string;
  readonly reason: string;
}

export interface WeeklyReport {
  readonly since: string;
  readonly until: string;
  readonly finished: number;
  readonly failed: readonly FailedRun[];
  // More failed steps than `failed` lists.
  readonly failedMore: number;
  readonly cost: number;
  readonly unpriced: number;
  readonly apiEquivalent: number | null;
  readonly plans: readonly {
    readonly name: string;
    readonly weeklyPercent: number | null;
    readonly fiveHourPercent: number | null;
  }[];
}

export interface AutopilotView {
  readonly forecast: BufferForecast;
  readonly warnings: readonly AutopilotWarning[];
  // When the checks that ask outside the database (sign-ins, the OpenRouter key, the disk) last
  // ran; null before the first one finished.
  readonly checkedAt: string | null;
  readonly weekly: WeeklyReport;
  // Settings → Notifications' Weekly report: sent to the Notification URL each Monday.
  readonly weeklyNotify: boolean;
}

// ceiling: the forecast looks two months ahead; the calendar can read 92 days.
export const forecastDays = 60;
// ceiling: a hidden warning comes back after a week if it is still true.
export const snoozeDays = 7;
// ceiling: a queue with fewer runs than this left, and nothing to refill it, is a warning.
export const fewTopicsLeft = 3;
// ceiling: the plan or key share at which work may soon stop.
export const lowPercent = 80;
// ceiling: free disk below either of these is a warning.
export const diskLowBytes = 5 * 1024 ** 3;
export const diskLowShare = 0.1;
