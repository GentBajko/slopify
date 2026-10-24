import type { ProviderFamily } from "@app/slices/settings/model.js";
import { useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { AgentSettings } from "@/agents/agent-settings";
import { useApp } from "@/app-context";
import { AutostartSettings } from "@/autostart/autostart-settings";
import { CatalogueSettings, RetiredModelsInUse } from "@/components/catalogue";
import { useCommand } from "@/components/kit/command-palette";
import { Select } from "@/components/kit/field";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { Rail, RailButton } from "@/components/kit/rail";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { ModelChecksSettings } from "@/components/model-checks";
import { useProviderHealth } from "@/components/provider-health";
import { type KeysFocus, ProviderKeys } from "@/components/provider-keys";
import { Voices } from "@/components/voices";
import { cn } from "@/lib/utils";
import { NotificationSettings } from "@/notifications/settings-panel";
import { patchNotesQuery } from "@/patch-notes/api";
import { PatchNotesSettings } from "@/patch-notes/settings-panel";
import { RemoteAccessSettings } from "@/remote-access/remote-access-settings";
import { StudioSettings } from "@/studio/settings-panel";
import { TemplateStudioSettings } from "@/template-studio/settings-panel";
import { TrashSettings } from "@/trash/trash-settings";
import { ChannelLinksSettings } from "@/youtube/channel-links";
import { AboutSettings, downloadDiagnostics } from "./settings-about";
import { BackLink, backPlace, type SettingsBack } from "./settings-back";
import { BackupSettings, useBackUpNow } from "./settings-backups";
import { StorageTools, storageQueryKey } from "./settings-export";
import { FilesFolder } from "./settings-files";
import { AppearanceSetting, ProductionDefaults } from "./settings-preferences";
import { ConnectionReadiness } from "./settings-readiness";
import { type SettingsSection, settingsSectionOf, settingsSections } from "./settings-sections";
import { UsageBoard } from "./usage";

export type { SettingsBack } from "./settings-back";
export {
  portableImportQueryKeys,
  portableMaxUploadBytes,
  refreshPortableImportQueries,
} from "./settings-export";
export { gapProblem } from "./settings-preferences";
export {
  type SettingsSection,
  settingsSectionOf,
  settingsSections,
} from "./settings-sections";

// Settings: one flat list of pages beside the page picked, each page named once (the list's
// row is its title). The page is the `section` search parameter, not a route, so the title
// follows it. On a phone the list is one select at the top, so the page starts right under it.
export function SettingsRoute({
  section: asked = "providers",
  note,
  family,
  provider,
  back,
  onSection = () => {},
  onNote = () => {},
}: {
  readonly section?: SettingsSection;
  // What's new: the note open in the reading view.
  readonly note?: string | undefined;
  // Keys & services: the family and the service to open and scroll to on arrival.
  readonly family?: ProviderFamily | undefined;
  readonly provider?: string | undefined;
  // The screen the person came from to add a key, offered as the way back.
  readonly back?: SettingsBack | undefined;
  readonly onSection?: (section: SettingsSection) => void;
  // Opens What's new at this note, or at its list.
  readonly onNote?: (note: string | undefined) => void;
}) {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const health = useProviderHealth();
  const backUp = useBackUpNow();
  const section = settingsSectionOf(asked);
  const current = settingsSections.find((item) => item.id === section) ?? settingsSections[0];

  useCommand({
    id: "settings.check-providers",
    title: "Check every service",
    group: "Settings",
    keywords: ["health", "keys", "signed in", "providers"],
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

  return (
    <div>
      <PageHeader
        crumb="Settings"
        title={current.label}
        meta={current.meta}
        actions={
          back === undefined ? undefined : (
            <BackLink back={back}>{`Back to ${backPlace(back)}`}</BackLink>
          )
        }
      />
      <Workspace
        sections={
          <>
            <Rail label="Settings pages" className="max-md:hidden">
              {settingsSections.map((item, index) => (
                <RailButton
                  key={item.id}
                  current={item.id === section}
                  onClick={() => onSection(item.id)}
                  // 36px rows whose whole name shows (a long one wraps rather than being cut),
                  // and a little space where one run of pages ends and the next begins.
                  className={cn(
                    "h-auto min-h-9 py-1.5 [&>.truncate]:whitespace-normal",
                    index > 0 && settingsSections[index - 1]?.run !== item.run && "mt-3",
                  )}
                >
                  {item.label}
                </RailButton>
              ))}
            </Rail>
            <Select
              aria-label="Settings page"
              className="w-full md:hidden"
              value={section}
              options={settingsSections.map((item) => ({ value: item.id, label: item.label }))}
              onChange={(event) => onSection(settingsSectionOf(event.target.value))}
            />
          </>
        }
      >
        <section aria-label={current.label} className="flex min-w-0 flex-col gap-4">
          {section === "providers" ? (
            <KeysAndServices family={family} provider={provider} back={back} health={health} />
          ) : null}
          {section === "voices" ? <Voices back={back} /> : null}
          {section === "models" ? (
            <>
              <ModelChecksSettings />
              <RetiredModelsInUse />
              <CatalogueSettings />
            </>
          ) : null}
          {section === "playback" ? (
            <>
              <ProductionDefaults />
              <SectionHead
                title="PDF look"
                meta="The fonts, colors and page layout of the PDFs Slopify makes."
              >
                <ButtonLink to="/document-themes">Edit PDF looks</ButtonLink>
              </SectionHead>
              <div>
                <SectionHead
                  title="Template samples"
                  meta="What a template's samples may spend while you edit it."
                />
                <TemplateStudioSettings />
              </div>
            </>
          ) : null}
          {section === "notifications" ? <NotificationSettings /> : null}
          {section === "studio" ? (
            <>
              <StudioSettings />
              <ChannelLinksSettings />
            </>
          ) : null}
          {section === "storage" ? (
            <>
              <BackupSettings />
              <FilesFolder usageQueryKey={storageQueryKey} />
              <StorageTools />
            </>
          ) : null}
          {section === "trash" ? <TrashSettings /> : null}
          {section === "general" ? (
            <>
              <AppearanceSetting />
              <AutostartSettings />
            </>
          ) : null}
          {section === "remote-access" ? <RemoteAccessSettings /> : null}
          {section === "agents" ? <AgentSettings /> : null}
          {section === "about" ? (
            <AboutSettings
              onWhatsNew={() => {
                queryClient.fetchQuery(patchNotesQuery(api)).then(
                  (notes) => onNote(notes.current ?? undefined),
                  (error: unknown) => {
                    notify(
                      `What's new did not open: ${error instanceof Error ? error.message : String(error)} Open Settings → What's new to try again.`,
                      "error",
                    );
                  },
                );
              }}
            />
          ) : null}
          {section === "usage" ? <UsageBoard /> : null}
          {section === "patch-notes" ? <PatchNotesSettings note={note} onNote={onNote} /> : null}
        </section>
      </Workspace>
    </div>
  );
}

// Keys & services: what each kind of work has, with its fix, then every service by kind. A
// readiness line's button, or a link from the welcome or Create, opens that kind's list and
// scrolls to it.
function KeysAndServices({
  family,
  provider,
  back,
  health,
}: {
  readonly family: ProviderFamily | undefined;
  readonly provider: string | undefined;
  readonly back: SettingsBack | undefined;
  readonly health: ReturnType<typeof useProviderHealth>;
}): ReactElement {
  const [focus, setFocus] = useState<KeysFocus | undefined>(() =>
    family === undefined && provider === undefined
      ? undefined
      : { family, provider, arrival: true },
  );
  return (
    <>
      <ConnectionReadiness
        health={health}
        onShow={(shown) => setFocus({ family: shown, provider: undefined, arrival: false })}
      />
      <ProviderKeys focus={focus} back={back} />
    </>
  );
}
