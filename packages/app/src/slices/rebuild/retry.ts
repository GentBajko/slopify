import type { DatabaseSync } from "node:sqlite";
import type { Clock } from "../../kernel/clock.js";
import { autoRetryDelay, type Fault } from "../../kernel/runner/retry-policy.js";
import type { WorkRef } from "../../kernel/runner/work.js";
import { autoRetriesOf, deferWork, dueRetries } from "../../kernel/runner/work-authority.js";

// The runner's store for the second tier of the retry policy (`kernel/runner/retry-policy.ts`):
// a failure time can fix puts the step back to wait, with the time it may run again.
export function waitToRetry(
  deps: { readonly db: DatabaseSync; readonly clock: Clock },
  work: WorkRef,
  fault: Fault | undefined,
  reason: string,
  random: () => number,
): string | undefined {
  const delay = autoRetryDelay(fault, autoRetriesOf(deps.db, work), random);
  if (delay === undefined || fault === undefined) return undefined;
  const at = new Date(deps.clock.now().getTime() + delay).toISOString();
  return deferWork(deps.db, work, at, reason, fault.kind) ? at : undefined;
}

// Ticks every project with a wait that has run out. Returns them, for the log and tests.
export function wakeRetries(
  db: DatabaseSync,
  clock: Clock,
  runner: { readonly tick: (projectId: string) => void },
): readonly string[] {
  const due = dueRetries(db, clock.now().toISOString());
  for (const projectId of due) runner.tick(projectId);
  return due;
}
