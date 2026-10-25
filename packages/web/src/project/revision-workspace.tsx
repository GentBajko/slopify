import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { RebuildReview } from "./rebuild-review.js";
import type { EditSection, RevisionController } from "./revision-controller.js";
import { RevisionFeedback } from "./revision-feedback.js";
import { RevisionHistory } from "./revision-history.js";

// The pieces of a project's settings that the project page lays out (`routes/project.tsx`,
// `settings-view.tsx`): the draft's controller and editor panel, Versions, and the review of
// what is made again.

export {
  type DraftNotice,
  type EditSection,
  type RevisionController,
  useRevisionController,
} from "./revision-controller.js";
export { RevisionEditPanel } from "./revision-edit-panel.js";

export interface EditorProps {
  readonly view: RevisionView;
  readonly edit: RevisionEdit;
  readonly fields: readonly { readonly field: string; readonly message: string }[];
  readonly onChange: (edit: RevisionEdit) => void;
  readonly onPending: (pending: boolean) => void;
  // The one edit section on screen. The others stay mounted, hidden, so an upload or an
  // unapplied caption edit survives a switch. Undefined shows everything.
  readonly section?: EditSection | undefined;
  // The section a change asked for from the project page opens; a new object each time.
  readonly focus?: { readonly section: EditSection } | undefined;
  // A bundled sample: its settings are shown to read, and nothing in them can be changed.
  readonly readOnly?: boolean | undefined;
}

export type ProjectTab = "output" | "live" | "edit" | "history" | "checkpoints" | "cost";

export function RevisionHistoryPanel({
  controller,
  projectId,
  active,
}: {
  readonly controller: RevisionController;
  readonly projectId: string;
  readonly active: boolean;
}): ReactElement | null {
  const c = controller;
  if (!active) return null;
  return (
    <>
      {c.preview === undefined && (c.error || c.refusal) ? (
        <div className="mb-4 flex flex-col gap-3">
          <RevisionFeedback error={c.error} refusal={c.refusal} />
          {c.edit === undefined && c.refusal?.reason === "conflict" ? (
            <Button disabled={c.pending} onClick={c.reloadCurrent} className="self-start">
              Reload the current version
            </Button>
          ) : null}
        </div>
      ) : null}
      <RevisionHistory projectId={projectId} pending={c.busy} onRestore={c.restore} />
    </>
  );
}

// The rebuild review, over whichever view is showing.
export function RebuildDrawer({
  controller,
}: {
  readonly controller: RevisionController;
}): ReactElement | null {
  const c = controller;
  return (
    <Drawer
      open={c.preview !== undefined}
      title="Choose what to make again"
      onClose={c.closePreview}
    >
      {c.preview === undefined ? null : (
        <RebuildReview
          key={c.preview.id}
          preview={c.preview}
          feedback={<RevisionFeedback error={c.error} refusal={c.refusal} />}
          pending={c.pending}
          onStart={c.start}
          onCancel={c.closePreview}
        />
      )}
    </Drawer>
  );
}
