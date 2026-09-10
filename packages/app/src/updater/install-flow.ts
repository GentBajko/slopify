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
    await deps.activate();
  } catch {
    await deps.stopCandidate();
    if (backedUp) await deps.restore();
    await deps.start(plan.oldEntry);
    await deps.healthy(plan.previousVersion);
    deps.report("The update did not start; the previous version and database were restored.");
    throw new Error("The previous Slopify version was restored.");
  }
  // The pointer rename commits the new database. The candidate may already observe
  // it and accept writes, so a lost unlock acknowledgement can never trigger rollback.
  await deps.release();
  deps.report(`Slopify ${plan.version} started successfully.`);
}
