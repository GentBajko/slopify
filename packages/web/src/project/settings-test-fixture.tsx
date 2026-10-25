import type { ProjectSummary } from "@app/slices/admission/model.js";
import { type ReactElement, type ReactNode, useState } from "react";
import { type Answer, jsonAnswer } from "@/test-app";
import { EditRequestContext, RegenerateNowContext } from "./revision-action-context.js";
import { revisionView } from "./revision-fixture.js";
import { RebuildDrawer, useRevisionController } from "./revision-workspace.js";
import { type SettingsTab, SettingsView } from "./settings-view.js";

// A project's settings as its page lays them out (`routes/project.tsx`), for the tests of the
// settings themselves: the live Settings view with its Versions tab and the review drawer, on
// project p1 at version r1. `beside` stands in for a section's button: it sends the page's
// change and make-again requests, as the sections do.
export function ProjectSettings({ beside }: { readonly beside?: ReactNode }): ReactElement {
  const [tab, setTab] = useState<SettingsTab>("settings");
  const controller = useRevisionController("p1", "r1", { onOpenEdit: () => setTab("settings") });
  const busy = controller.pending || controller.preview !== undefined;
  return (
    <EditRequestContext value={busy ? undefined : controller.requestEdit}>
      <RegenerateNowContext value={busy ? undefined : controller.regenerateNow}>
        {beside}
        <SettingsView
          shown
          tab={tab}
          onTab={setTab}
          controller={controller}
          projectId="p1"
          project={project}
          revisionId="r1"
          stages={[]}
          sample={false}
          onCopyId={() => undefined}
        />
        <RebuildDrawer controller={controller} />
      </RegenerateNowContext>
    </EditRequestContext>
  );
}

const saved = revisionView();
const project = {
  id: "p1",
  title: saved.revision.config.title,
  format: "16:9",
  status: "done",
  config: saved.revision.config,
  createdAt: saved.revision.createdAt,
} as ProjectSummary;

// What the settings' form reads besides the version itself: no services, voices, prompts,
// intros or fonts.
export const settingsRoutes: Readonly<Record<string, Answer>> = {
  "GET /api/providers": jsonAnswer({ providers: [] }),
  "GET /api/settings/voices": jsonAnswer({ voices: [] }),
  "GET /api/prompts": jsonAnswer({ prompts: [] }),
  "GET /api/entries": jsonAnswer({ entries: [] }),
  "GET /api/fonts": jsonAnswer({ fonts: [] }),
};
