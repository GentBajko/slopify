import type { ProjectSummary, Stage } from "@app/slices/admission/model.js";
import { type ReactElement, useEffect, useState } from "react";
import { Button } from "@/components/kit/button";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { CheckpointPanel } from "./checkpoint-panel.js";
import { FreeSpaceOffer } from "./free-space.js";
import { RevisionContentEditors } from "./revision-content.js";
import { RevisionForm } from "./revision-form.js";
import {
  type EditSection,
  type RevisionController,
  RevisionEditPanel,
  RevisionHistoryPanel,
} from "./revision-workspace.js";

// What Edit settings opens, in the main column at its full width: the project's settings in the
// same sections, order and words as Create, and its Versions. Pauses and checks is one of the
// settings' sections, as it is in Create: the pauses for this run and the automatic checks.
export type SettingsTab = "settings" | "versions";

export function SettingsView({
  shown,
  tab,
  opening,
  onTab,
  controller,
  projectId,
  project,
  revisionId,
  stages,
  sample,
  onCopyId,
}: {
  readonly shown: boolean;
  readonly tab: SettingsTab;
  // The settings section an address opened (`?section=checkpoints` is Pauses and checks).
  readonly opening?: EditSection | undefined;
  readonly onTab: (tab: SettingsTab) => void;
  readonly controller: RevisionController;
  readonly projectId: string;
  readonly project: ProjectSummary;
  readonly revisionId: string | null;
  readonly stages: readonly Stage[];
  // A bundled sample, or not known yet: it offers no space to free.
  readonly sample: boolean;
  readonly onCopyId: () => void;
}): ReactElement {
  // The section open in the settings: the one an address names, then the one the person
  // picked, so a save (which opens the settings again on the new version) keeps the place.
  const [section, setSection] = useState<EditSection | undefined>(opening);
  useEffect(() => {
    if (opening !== undefined) setSection(opening);
  }, [opening]);
  return (
    <section
      hidden={!shown}
      aria-label="Settings"
      data-slot="project-settings"
      className="flex min-w-0 flex-col gap-3"
    >
      <Tabs
        items={[
          {
            id: "settings",
            label: "Settings",
            ...(controller.unsaved ? { badge: "· unsaved" } : {}),
          },
          { id: "versions", label: "Versions" },
        ]}
        value={tab}
        onChange={onTab}
        label="Settings views"
        idPrefix="project-settings"
      />
      <TabPanel idPrefix="project-settings" id="settings" active={tab === "settings"}>
        <RevisionEditPanel
          controller={controller}
          projectId={projectId}
          active={shown && tab === "settings"}
          // Shut only after a discard (with its Undo) or while it opens: no list of files here,
          // All files has them.
          intro={<p className="m-0 text-small text-ink-2">The settings are as last saved.</p>}
          renderEditor={(props) => (
            <RevisionForm
              {...props}
              opening={section}
              onSection={setSection}
              checks={
                <CheckpointPanel
                  projectId={projectId}
                  revisionId={revisionId}
                  paused={project.status === "paused"}
                  stages={stages}
                />
              }
              renderContent={(contentProps) => (
                <RevisionContentEditors key={contentProps.view.revision.id} {...contentProps} />
              )}
            />
          )}
        />
      </TabPanel>
      <TabPanel
        idPrefix="project-settings"
        id="versions"
        active={tab === "versions"}
        className="flex flex-col gap-4"
      >
        <RevisionHistoryPanel
          controller={controller}
          projectId={projectId}
          active={shown && tab === "versions"}
        />
        <FreeSpaceOffer
          projectId={projectId}
          title={project.title}
          status={project.status}
          sample={sample}
        />
        <p className="m-0 flex flex-wrap items-center gap-2 text-small text-ink-2">
          <span>
            Project ID <span className="font-mono text-ink">{projectId}</span>
          </span>
          <Button variant="quiet" size="small" onClick={onCopyId}>
            Copy project ID
          </Button>
        </p>
      </TabPanel>
    </section>
  );
}
