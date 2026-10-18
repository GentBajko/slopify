import type { DatabaseSync } from "node:sqlite";
import { setImmediate as yieldToLoop } from "node:timers/promises";
import { errorText } from "../../kernel/errors.js";
import type { Log } from "../../kernel/log.js";
import { claimNextJob, finishJob, recoverJobs, type SampleJob } from "./jobs.js";

export interface SampleRunnerDeps {
  readonly db: DatabaseSync;
  readonly log: Log;
  // Makes what a job asks for. Local renders take the signal, which aborts them at shutdown;
  // paid work it starts runs in the project's own runner and is never aborted from here.
  readonly make: (job: SampleJob, signal: AbortSignal) => Promise<void>;
  // Told when a template's samples changed, so open studio pages read it again.
  readonly changed: (templateId: string) => void;
}

export interface SampleRunner {
  readonly start: () => void;
  // A job was queued, or something a held job waits on changed: look again.
  readonly wake: () => void;
  // Resolves once the loop has stopped; an interrupted job is queued again at the next start.
  readonly stop: () => Promise<void>;
  // Resolves once no job is waiting or running. Tests.
  readonly idle: () => Promise<void>;
}

// The studio's one sample loop, beside the schedules' (`schedules/scheduler.ts`): it makes one
// job at a time across every template and never blocks a request, yielding to the event loop
// between steps.
export function createSampleRunner(deps: SampleRunnerDeps): SampleRunner {
  const controller = new AbortController();
  let loop: Promise<void> | undefined;
  let nudge: (() => void) | undefined;
  let pending = false;
  const idleWaiters: (() => void)[] = [];
  const settleIdle = (): void => {
    for (const resolve of idleWaiters.splice(0)) resolve();
  };
  const wait = (): Promise<void> =>
    new Promise((resolve) => {
      if (pending || controller.signal.aborted) {
        resolve();
        return;
      }
      nudge = resolve;
    });

  const run = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      pending = false;
      await yieldToLoop();
      const job = claimNextJob(deps.db);
      if (job === undefined) {
        settleIdle();
        await wait();
        nudge = undefined;
        continue;
      }
      deps.changed(job.templateId);
      try {
        await deps.make(job, controller.signal);
      } catch (error) {
        if (controller.signal.aborted) return;
        deps.log.write("error", "template-studio.sample", {
          detail: `The sample job of template ${job.templateId} version ${String(job.templateVersion)} stopped: ${errorText(error)}`,
        });
      }
      if (controller.signal.aborted) return;
      finishJob(deps.db, job.templateId);
      deps.changed(job.templateId);
    }
  };

  return {
    start: () => {
      if (loop !== undefined) return;
      recoverJobs(deps.db);
      loop = run().catch((error: unknown) => {
        deps.log.write("error", "template-studio.runner", {
          detail: `The template studio's sample loop stopped: ${errorText(error)}. Restart Slopify to make samples again.`,
        });
      });
    },
    wake: () => {
      pending = true;
      nudge?.();
    },
    stop: async () => {
      controller.abort();
      nudge?.();
      await loop;
      settleIdle();
    },
    idle: () =>
      new Promise((resolve) => {
        if (loop === undefined || controller.signal.aborted) {
          resolve();
          return;
        }
        idleWaiters.push(resolve);
        // Settles at once when the loop is already waiting with nothing to do.
        if (nudge !== undefined && !pending) settleIdle();
      }),
  };
}
