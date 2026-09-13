import type { UpdatePlan } from "./plan.js";

export interface UpdateFlowDeps {
  readonly install: () => Promise<string>;
  readonly handoff: () => Promise<void>;
  readonly backup: () => Promise<void>;
  readonly start: (entry: string) => Promise<void>;
  readonly healthy: (version: string) => Promise<void>;
  readonly stopCandidate: () => Promise<void>;
  readonly restore: () => Promise<void>;
  readonly activate: () => Promise<void>;
  readonly release: () => Promise<void>;
  readonly prune: () => Promise<void>;
  readonly report: (message: string) => void;
}

export async function runUpdateFlow(plan: UpdatePlan, deps: UpdateFlowDeps): Promise<void> {
  const entry = await deps.install();
  // npm or package verification failures leave the currently serving app entirely alone.
  await deps.handoff();
  let backedUp = false;
  try {
    await deps.backup();
    backedUp = true;
    await deps.start(entry);
    await deps.healthy(plan.version);
  } catch {
    await deps.stopCandidate();
    if (backedUp) await deps.restore();
    await deps.start(plan.oldEntry);
    await deps.healthy(plan.previousVersion);
    deps.report("The update did not start; the previous version and database were restored.");
    throw new Error("The previous Slopify version was restored.");
  }
  // Prune before publishing the activation pointer. The candidate's recovery watcher uses
  // that pointer as its unlock signal, so publishing it first could admit a second update
  // while this worker is still deleting artifacts. The pruner retains both runnable
  // versions and the fresh rollback backup, so a later activation failure remains safe.
  let pruneFailed = false;
  try {
    await deps.prune();
  } catch {
    // Cleanup is maintenance and must never prevent a healthy candidate from activating.
    pruneFailed = true;
  }
  try {
    await deps.activate();
  } catch {
    await deps.stopCandidate();
    if (backedUp) await deps.restore();
    await deps.start(plan.oldEntry);
    await deps.healthy(plan.previousVersion);
    deps.report("The update did not start; the previous version and database were restored.");
    throw new Error("The previous Slopify version was restored.");
  }
  if (pruneFailed)
    deps.report("The update started, but obsolete update files could not be removed.");
  // The pointer rename commits the new database. A lost unlock acknowledgement cannot
  // safely roll it back; the candidate's watcher observes the same pointer and recovers.
  await deps.release();
  deps.report(`Slopify ${plan.version} started successfully.`);
}
