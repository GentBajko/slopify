import type { ProjectState } from "../../kernel/pipeline.js";

// A settled project (`settledProjects`: uploaded with nothing left to run, or finished and left
// only with files an edit made outdated) reads done where its run would read paused or pending:
// the Projects list, a project's page and the calendar.
export function settledStatus(status: ProjectState, settled: boolean): ProjectState {
  return settled && (status === "paused" || status === "pending") ? "done" : status;
}
