import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { type Fix, fixFor, stageProvider } from "@app/slices/fixes/rules.js";
import { createContext } from "react";
import type { ProjectTab } from "./revision-workspace.js";

// Lets a control deep in a section open another of the project's views (the settings, where
// prompts and models are changed). Absent outside the project page.
export const OpenProjectTab = createContext<((tab: ProjectTab) => void) | undefined>(undefined);

// The fix a failed step offers (`slices/fixes/rules.ts`): signing a CLI in, a key, free
// space, a softer prompt or another model. The project's next action is named after it.
export function fixOf(stage: Stage, project: ProjectSummary): Fix | undefined {
  if (stage.state !== "failed") return undefined;
  return fixFor({
    stage: stage.kind,
    kind: stage.failureKind,
    reason: stage.failureReason,
    provider: stageProvider(project.config, stage.kind),
  });
}
