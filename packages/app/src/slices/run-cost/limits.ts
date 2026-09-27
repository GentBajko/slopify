import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import type { Clock } from "../../kernel/clock.js";
import { causedBy } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import type { PlanAccount, PlanLimitHit } from "../../kernel/ports/plan-limits.js";
import type { LimitGate, LimitWaiter } from "../../kernel/runner/meter.js";

// Living within a CLI's plan limits. When a CLI says its allowance is used up, the time it
// returns is stored per account; every call to that CLI - from any project, and after a
// restart - waits for it instead of failing. Other providers are untouched, so a project
// whose narration is keyed carries on while its Codex images wait.

// Waking a little after the stated reset, so the first call is not refused again at the edge.
export const resetMarginMs = 2 * 60_000;
// When the CLI names no reset time, the wait checks again this often.
export const recheckMs = 30 * 60_000;

export interface LimitGateDeps {
  readonly db: DatabaseSync;
  readonly clock: Clock;
  readonly log: Log;
  // A waiting stage starting or ending, so the open project page refetches.
  readonly changed: (projectId: string) => void;
}

const waitRow = z.object({ retry_at: z.string() });

export function createLimitGate(deps: LimitGateDeps): LimitGate {
  // How many calls of one stage wait on one account: a stage drawing four Codex images at
  // once shows one wait, removed when the last of them wakes.
  const waiting = new Map<string, number>();

  const retryAt = (account: PlanAccount): number | undefined => {
    const row = deps.db
      .prepare("SELECT retry_at FROM plan_limit_waits WHERE account = ?")
      .get(account);
    if (row === undefined) return undefined;
    return Date.parse(waitRow.parse(row).retry_at);
  };

  const begin = (account: PlanAccount, waiter: LimitWaiter): void => {
    const key = JSON.stringify([waiter.projectId, waiter.stage, account]);
    waiting.set(key, (waiting.get(key) ?? 0) + 1);
    const inserted = deps.db
      .prepare(
        "INSERT OR IGNORE INTO plan_limit_waiters (project_id, stage, account, since) VALUES (?, ?, ?, ?)",
      )
      .run(waiter.projectId, waiter.stage, account, deps.clock.now().toISOString());
    if (inserted.changes === 1) deps.changed(waiter.projectId);
  };

  // Only a wait that ran its course removes the row. One cut short by cancel, pause or the
  // app stopping leaves it, and the next start decides what it means (resumeAfterRestart).
  const end = (account: PlanAccount, waiter: LimitWaiter, woke: boolean): void => {
    const key = JSON.stringify([waiter.projectId, waiter.stage, account]);
    const left = (waiting.get(key) ?? 1) - 1;
    if (left > 0) {
      waiting.set(key, left);
      return;
    }
    waiting.delete(key);
    if (!woke) return;
    deps.db
      .prepare("DELETE FROM plan_limit_waiters WHERE project_id = ? AND stage = ? AND account = ?")
      .run(waiter.projectId, waiter.stage, account);
    deps.changed(waiter.projectId);
  };

  return {
    ready: async (account, waiter, signal) => {
      for (;;) {
        signal.throwIfAborted();
        const due = retryAt(account);
        if (due === undefined) return;
        const left = due - deps.clock.now().getTime();
        if (left <= 0) {
          // Past the reset: the allowance is back. A call refused again stores a new wait.
          deps.db
            .prepare("DELETE FROM plan_limit_waits WHERE account = ? AND retry_at <= ?")
            .run(account, deps.clock.now().toISOString());
          return;
        }
        begin(account, waiter);
        let woke = false;
        try {
          await deps.clock.sleep(left, signal);
          woke = true;
        } finally {
          end(account, waiter, woke);
        }
      }
    },
    exhausted: (hit: PlanLimitHit) => {
      const now = deps.clock.now().getTime();
      const reset = hit.resetsAt === null ? Number.NaN : Date.parse(hit.resetsAt);
      // A stated reset already past (a clock skew, a stale message) is checked again soon.
      const due = Number.isFinite(reset) && reset > now ? reset + resetMarginMs : now + recheckMs;
      const retry = new Date(due).toISOString();
      try {
        deps.db
          .prepare(
            `INSERT INTO plan_limit_waits (account, resets_at, retry_at, detected_at) VALUES (?, ?, ?, ?)
             ON CONFLICT(account) DO UPDATE SET resets_at = excluded.resets_at, retry_at = excluded.retry_at, detected_at = excluded.detected_at
             WHERE excluded.retry_at > plan_limit_waits.retry_at`,
          )
          .run(
            hit.account,
            Number.isFinite(reset) && reset > now ? new Date(reset).toISOString() : null,
            retry,
            new Date(now).toISOString(),
          );
      } catch (error) {
        deps.log.write("error", "plan-limits", { detail: causedBy(error) });
        throw error;
      }
      deps.log.write("info", "plan-limits", {
        detail: `${hit.account} plan limit used up; waiting until ${retry}`,
      });
    },
  };
}

// At start, a stage that was waiting on a plan limit when the app stopped was marked
// interrupted like any other (main.ts markInterruptedStages). Those projects are resumed so
// the wait carries on by itself - their calls meet the stored reset and wait again. A project
// paused or cancelled meanwhile is left as it is.
export async function resumeAfterRestart(
  db: DatabaseSync,
  resume: (projectId: string) => Promise<boolean>,
  log: Log,
): Promise<number> {
  const projects = db
    .prepare(
      `SELECT DISTINCT w.project_id AS id FROM plan_limit_waiters w
       JOIN stages s ON s.project_id = w.project_id AND s.kind = w.stage
       WHERE s.state = 'failed' AND s.failure_reason = 'interrupted'
       AND NOT EXISTS (SELECT 1 FROM project_controls c WHERE c.project_id = w.project_id AND c.paused = 1)`,
    )
    .all()
    .map((row) => z.string().parse(row.id));
  db.prepare("DELETE FROM plan_limit_waiters").run();
  let resumed = 0;
  for (const projectId of projects) {
    try {
      if (await resume(projectId)) resumed += 1;
      else
        log.write("warn", "plan-limits", {
          projectId,
          detail:
            "A project waiting for CLI limits could not be resumed after the restart; use Resume on the project page.",
        });
    } catch (error) {
      log.write("error", "plan-limits", { projectId, detail: causedBy(error) });
    }
  }
  return resumed;
}
