import { useQueryClient } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { useApp } from "@/app-context";
import { AutostartSettings } from "@/autostart/autostart-settings";
import { CatalogueSettings } from "@/components/catalogue";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { InfoTip } from "@/components/kit/info-tip";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { FileLink } from "@/components/kit/link";
import { Rail, RailButton } from "@/components/kit/rail";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { useToast } from "@/components/kit/toast";
import { ProviderHealthCheck, useProviderHealth } from "@/components/provider-health";
import { ProviderKeys } from "@/components/provider-keys";
import { Voices } from "@/components/voices";
import { Welcome } from "@/components/welcome";
import { NotificationSettings } from "@/notifications/settings-panel";
import { SampleSettings } from "@/onboarding/sample-settings";
import { patchNotesQuery } from "@/patch-notes/api";
import { PatchNotesSettings } from "@/patch-notes/settings-panel";
import { StudioSettings } from "@/studio/settings-panel";
import { TrashSettings } from "@/trash/trash-settings";
import { ChannelLinksSettings } from "@/youtube/channel-links";
import { AboutSettings } from "./settings-about";
import { BackupSettings, useBackUpNow } from "./settings-backups";
import { StorageTools, storageQueryKey } from "./settings-export";
import { FilesFolder } from "./settings-files";
import { AppearanceSetting, ProductionDefaults } from "./settings-preferences";
import { ConnectionReadiness } from "./settings-readiness";
import {
  groupOfSection,
  type SettingsSection,
  settingsGroups,
  settingsSectionOf,
  settingsSections,
} from "./settings-sections";
import { UsageBoard } from "./usage";

export {
  ImportResult,
  portableImportQueryKeys,
  portableMaxUploadBytes,
  refreshPortableImportQueries,
} from "./settings-export";
export { gapProblem } from "./settings-preferences";
export {
  type SettingsSection,
  settingsGroups,
  settingsSectionOf,
  settingsSections,
} from "./settings-sections";

// The browser's own download of the diagnostics file, the same one the header's link saves.
function downloadDiagnostics(origin: string): void {
  const link = document.createElement("a");
  link.href = `${origin}/api/diagnostics`;
  link.download = "slopify-diagnostics.json";
  document.body.append(link);
  link.click();
  link.remove();
}

// A settings rail of a few groups beside one section at a time; a group of several sections
// shows them as tabs. The section is the `section` search parameter, not a route, so the page
// title follows it; on phones the rail is a row of tabs that scrolls sideways on its own.
// Explanations sit behind the info buttons beside what they explain.
export function SettingsRoute({
  section: asked = "providers",
  note,
  onSection = () => {},
  onNote = () => {},
}: {
  readonly section?: SettingsSection;
  // Settings → Patch notes: the note open in the reading view.
  readonly note?: string | undefined;
  readonly onSection?: (section: SettingsSection) => void;
  // Opens Settings → Patch notes at this note, or at its list.
  readonly onNote?: (note: string | undefined) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const health = useProviderHealth();
  const backUp = useBackUpNow();
  const section = settingsSectionOf(asked);
  const current = settingsSections.find((item) => item.id === section) ?? settingsSections[0];
  const group = groupOfSection(section);

  useCommand({
    id: "settings.check-providers",
    title: "Check all providers",
    group: "Settings",
    keywords: ["health", "keys", "signed in"],
    run: () => {
      onSection("providers");
      health.mutate();
    },
  });
  useCommand({
    id: "settings.back-up-now",
    title: "Back up now",
    group: "Settings",
    keywords: ["backup"],
    run: () => {
      onSection("storage");
      backUp.mutate(undefined, {
        onError: (error) => {
          notify(
            `The backup didn't start: ${error.message} Open Settings → Backup & storage to see its state.`,
            "error",
          );
        },
      });
    },
  });
  useCommand({
    id: "settings.download-diagnostics",
    title: "Download diagnostics",
    group: "Settings",
    keywords: ["support", "bug report"],
    run: () => {
      downloadDiagnostics(api.origin);
    },
  });

  const tabs = group.sections.map((id) => ({
    id,
    label: settingsSections.find((item) => item.id === id)?.label ?? id,
  }));

  return (
    <div>
      <PageHeader
        crumb="Settings"
        title={current.label}
        meta={current.meta}
        actions={
          <>
            {section === "providers" ? (
              <Button disabled={health.isPending} onClick={() => health.mutate()}>
                {health.isPending ? "Checking…" : "Check all"}
              </Button>
            ) : null}
            <span className="inline-flex items-center gap-1">
              <FileLink
                variant="secondary"
                href={`${api.origin}/api/diagnostics`}
                download="slopify-diagnostics.json"
              >
                <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                Download diagnostics
              </FileLink>
              <InfoTip id="settings.diagnostics" />
            </span>
          </>
        }
      />
      <Workspace
        sections={
          <Rail label="Settings sections">
            {settingsGroups.map((item) => (
              <RailButton
                key={item.id}
                current={item.id === group.id}
                onClick={() => onSection(item.sections[0] ?? "providers")}
                className="whitespace-nowrap max-md:w-auto"
              >
                {item.label}
              </RailButton>
            ))}
          </Rail>
        }
      >
        {tabs.length > 1 ? (
          <Tabs
            items={tabs}
            value={section}
            onChange={onSection}
            label={`${group.label} sections`}
            idPrefix="settings"
            className="mb-6"
          />
        ) : null}
        <TabPanel idPrefix="settings" id={section} active>
          <section aria-label={current.label} className="flex min-w-0 flex-col gap-10">
            {section === "providers" ? (
              <>
                <ConnectionReadiness />
                <Welcome />
                <ProviderKeys />
                <ProviderHealthCheck run={health} />
              </>
            ) : null}
            {section === "general" ? (
              <>
                <AppearanceSetting />
                <AutostartSettings />
              </>
            ) : null}
            {section === "voices" ? <Voices /> : null}
            {section === "models" ? <CatalogueSettings /> : null}
            {section === "playback" ? <ProductionDefaults /> : null}
            {section === "notifications" ? <NotificationSettings /> : null}
            {section === "channel-links" ? <ChannelLinksSettings /> : null}
            {section === "studio" ? <StudioSettings /> : null}
            {section === "storage" ? (
              <>
                <BackupSettings />
                <FilesFolder usageQueryKey={storageQueryKey} />
                <StorageTools />
                <SampleSettings />
              </>
            ) : null}
            {section === "trash" ? <TrashSettings /> : null}
            {section === "usage" ? <UsageBoard /> : null}
            {section === "patch-notes" ? <PatchNotesSettings note={note} onNote={onNote} /> : null}
            {section === "about" ? (
              <AboutSettings
                onWhatsNew={() => {
                  queryClient.fetchQuery(patchNotesQuery(api)).then(
                    (notes) => onNote(notes.current ?? undefined),
                    (error: unknown) => {
                      notify(
                        `The patch notes did not open: ${error instanceof Error ? error.message : String(error)} Open Settings → About → Patch notes to try again.`,
                        "error",
                      );
                    },
                  );
                }}
              />
            ) : null}
          </section>
        </TabPanel>
      </Workspace>
    </div>
  );
}
