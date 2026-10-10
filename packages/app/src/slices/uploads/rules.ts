import type { ProjectState } from "../../kernel/pipeline.js";

// An uploaded, settled project (`uploadedAndSettled`) reads done where its run would read paused
// or pending: the Projects list, a project's page and the calendar.
export function settledStatus(status: ProjectState, settled: boolean): ProjectState {
  return settled && (status === "paused" || status === "pending") ? "done" : status;
}
