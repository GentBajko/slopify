import type { RevisionEdit, RevisionView } from "@app/slices/revisions/model.js";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/kit/button";
import { Drawer } from "@/components/kit/drawer";
import { type TabItem, TabPanel, Tabs } from "@/components/kit/tabs";
import { RebuildReview } from "./rebuild-review.js";
import { EditRequestContext, RegenerateNowContext } from "./revision-action-context.js";
import {
  type EditSection,
  type RevisionController,
  useRevisionController,
} from "./revision-controller.js";
import { RevisionEditPanel } from "./revision-edit-panel.js";
import { RevisionFeedback } from "./revision-feedback.js";
import { RevisionHistory } from "./revision-history.js";

export {
  type DraftNotice,
  type EditSection,
  needsNoConsent,
  type RevisionController,
  startsWithoutReview,
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
              Reload current revision
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
    <Drawer open={c.preview !== undefined} title="Choose what to remake" onClose={c.closePreview}>
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

// The saved revisions on their own, as tabs: Edit and History, with the page's other views
// passed in. The project page lays these views out in its own section rail; this keeps them
// usable, and tested, as one piece.
export function RevisionWorkspace({
  projectId,
  currentRevisionId,
  renderEditor,
  tab: controlledTab,
  onTab,
  output,
  live,
  checkpoints,
  checkpointBadge,
  cost,
  trailing,
}: {
  readonly projectId: string;
  readonly currentRevisionId: string | null;
  readonly renderEditor: (props: EditorProps) => ReactNode;
  readonly tab?: ProjectTab;
  readonly onTab?: (tab: ProjectTab) => void;
  // The stage output panel. Without it (a unit test of the workspace alone) there is no
  // Output tab and Edit opens first.
  readonly output?: ReactNode;
  readonly live?: ReactNode;
  readonly checkpoints?: ReactNode;
  readonly checkpointBadge?: string;
  readonly cost?: ReactNode;
  readonly trailing?: ReactNode;
}): ReactElement {
  const [ownTab, setOwnTab] = useState<ProjectTab>(output === undefined ? "edit" : "output");
  const tab = controlledTab ?? ownTab;
  const selectTab = (next: ProjectTab) => {
    setOwnTab(next);
    onTab?.(next);
  };
  const controller = useRevisionController(projectId, currentRevisionId, {
    onOpenEdit: () => selectTab("edit"),
  });
  const tabs: TabItem<ProjectTab>[] = [
    ...(output === undefined ? [] : [{ id: "output" as const, label: "Output" }]),
    ...(live === undefined ? [] : [{ id: "live" as const, label: "Live" }]),
    {
      id: "edit",
      label: "Edit",
      ...(controller.unsaved ? { badge: "· unsaved" } : {}),
    },
    { id: "history", label: "History" },
    ...(checkpoints === undefined
      ? []
      : [
          {
            id: "checkpoints" as const,
            label: "Checkpoints",
            ...(checkpointBadge === undefined ? {} : { badge: checkpointBadge }),
          },
        ]),
    ...(cost === undefined ? [] : [{ id: "cost" as const, label: "Run cost" }]),
  ];
  return (
    <section aria-label="Project revisions">
      <Tabs
        items={tabs}
        value={tab}
        onChange={selectTab}
        label="Project views"
        idPrefix="project"
        trailing={trailing}
        className="mb-4"
      />
      {output === undefined ? null : (
        <TabPanel idPrefix="project" id="output" active={tab === "output"}>
          <EditRequestContext
            value={
              controller.pending || controller.preview !== undefined
                ? undefined
                : controller.requestEdit
            }
          >
            <RegenerateNowContext
              value={
                controller.pending || controller.preview !== undefined
                  ? undefined
                  : controller.regenerateNow
              }
            >
              {output}
            </RegenerateNowContext>
          </EditRequestContext>
        </TabPanel>
      )}
      <TabPanel idPrefix="project" id="edit" active={tab === "edit"}>
        <RevisionEditPanel
          controller={controller}
          renderEditor={renderEditor}
          active={tab === "edit"}
        />
      </TabPanel>
      <TabPanel idPrefix="project" id="history" active={tab === "history"}>
        <RevisionHistoryPanel
          controller={controller}
          projectId={projectId}
          active={tab === "history"}
        />
      </TabPanel>
      {live === undefined ? null : (
        <TabPanel idPrefix="project" id="live" active={tab === "live"}>
          {tab === "live" ? live : null}
        </TabPanel>
      )}
      {checkpoints === undefined ? null : (
        <TabPanel idPrefix="project" id="checkpoints" active={tab === "checkpoints"}>
          {checkpoints}
        </TabPanel>
      )}
      {cost === undefined ? null : (
        <TabPanel idPrefix="project" id="cost" active={tab === "cost"}>
          {cost}
        </TabPanel>
      )}
      <RebuildDrawer controller={controller} />
    </section>
  );
}
