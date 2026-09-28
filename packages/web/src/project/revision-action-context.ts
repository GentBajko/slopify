import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { createContext } from "react";
import type { EditSection } from "./revision-workspace.js";

export const RevisionControlContext = createContext(false);

// A change the project page asks Edit project to make, such as making one short again: the
// Edit tab opens with it applied to the draft (a fresh one, or the one already open) and
// the section it belongs to showing, for the user to review and save. Undefined while the
// workspace is busy or outside a project page.
export interface EditRequest {
  readonly section: EditSection;
  readonly change: (edit: RevisionEdit, view: RevisionView) => RevisionEdit;
}
export const EditRequestContext = createContext<((request: EditRequest) => void) | undefined>(
  undefined,
);

// Makes the given pictures again now (`RevisionController.regenerateNow`). Undefined while
// the workspace is busy or outside a project page, like `EditRequestContext`.
export const RegenerateNowContext = createContext<
  ((workKeys: readonly string[]) => void) | undefined
>(undefined);
