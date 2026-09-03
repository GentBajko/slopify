import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import type { Output, OutputRole } from "@app/slices/storage/model.js";
import type { ProjectActions } from "./use-actions.js";

// What every stage body is handed. One shape, so the six of them stay interchangeable and
// the row that opens them does not have to know which is which.

export interface BodyProps {
  readonly stage: Stage;
  readonly project: ProjectSummary;
  // The project's whole output set: the article body wants its sources, the video body
  // wants nothing else, and filtering is each body's own business.
  readonly outputs: readonly Output[];
  readonly actions: ProjectActions;
  // `logic/12` §Q106: while any stage of the project is running, every edit and re-run
  // control is disabled. The server refuses these too; this is the half the user sees.
  readonly busy: boolean;
}

export function outputsOf(outputs: readonly Output[], stage: Stage): readonly Output[] {
  return outputs.filter((output) => output.stageKind === stage.kind);
}

export function roleOf(outputs: readonly Output[], role: OutputRole): Output | undefined {
  return outputs.find((output) => output.role === role);
}
