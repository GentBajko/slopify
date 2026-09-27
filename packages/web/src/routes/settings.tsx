import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import type { ItemCounts } from "@app/slices/storage/backup-import.js";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import {
  type BackupImportSummary,
  readBackupExportSummary,
  readStorageUsage,
  saveAppSettings,
} from "@/api";
import { useApp } from "@/app-context";
import { AutostartSettings } from "@/autostart/autostart-settings";
import { CatalogueSettings } from "@/components/catalogue";
import { Button, buttonClass } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Field, Input } from "@/components/kit/field";
import { PageHeader, Workspace } from "@/components/kit/layout";
import { Rail, RailButton } from "@/components/kit/rail";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { Segmented } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { ProviderHealthCheck, useProviderHealth } from "@/components/provider-health";
import { ProviderKeys } from "@/components/provider-keys";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Voices } from "@/components/voices";
import { Welcome } from "@/components/welcome";
import { cn } from "@/lib/utils";
import { NotificationSettings } from "@/notifications/settings-panel";
import { SampleSettings } from "@/onboarding/sample-settings";
import { keys, settingsQuery } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { StudioSettings } from "@/studio/settings-panel";
import { fontsKey } from "@/subtitles/api";
import { templatesKey } from "@/templates/api";
import { TrashSettings } from "@/trash/trash-settings";
import { ChannelLinksSettings } from "@/youtube/channel-links";
import { AboutSettings } from "./settings-about";
import { BackupSettings, useBackUpNow } from "./settings-backups";
import { formatBytes, ProjectStorageList } from "./settings-storage";
import { UsageBoard } from "./usage";

const storageQueryKey = ["storage-usage"] as const;
export const portableMaxUploadBytes = 100 * 1024 * 1024;
export const portableImportQueryKeys = [
  storageQueryKey,
  keys.projects,
  ["project"] as const,
  keys.usage,
  keys.documentThemes,
  schedulesKey,
  ["play-drafts"] as const,
  keys.settings,
  keys.providers,
  keys.voices,
  keys.prompts,
  keys.entries,
  keys.staging,
  templatesKey,
  fontsKey,
  ["provider-models"] as const,
] as const;

export async function refreshPortableImportQueries(queryClient: QueryClient): Promise<void> {
  await Promise.all(
    portableImportQueryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
  );
}

// The bound slices/admission/rules.ts validates a run's gap against, so the field refuses
// what a run would refuse rather than letting the server say it first.
const silenceGapSecondsMax = 30;

const appearances: readonly { readonly value: Appearance; readonly label: string }[] = [
  { value: "system", label: "System" },
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
];

// Empty, negative, fractional or past the bound: one sentence, the server's own
// (slices/settings/playback.ts).
export function gapProblem(value: string): string | undefined {
  const trimmed = value.trim();
  const bounded =
    /^\d+$/.test(trimmed) && Number(trimmed) >= 0 && Number(trimmed) <= silenceGapSecondsMax;
  return bounded
    ? undefined
    : `The silence gap is a whole number of seconds between 0 and ${String(silenceGapSecondsMax)}.`;
}

// Each section's title is the page title, and its one line of meta sits under it.
export const settingsSections = [
  {
    id: "general",
    label: "General",
    meta: "How Slopify starts on this computer.",
  },
  {
    id: "providers",
    label: "Providers",
    meta: "Keys stay on this machine and go only to their provider. Readiness is checked again before each run.",
  },
  {
    id: "voices",
    label: "Voices",
    meta: "A wrong voice ID shows up when the audio stage uses it.",
  },
  {
    id: "models",
    label: "Models",
    meta: "New models, prices and retirements, checked once a day.",
  },
  {
    id: "playback",
    label: "Playback & appearance",
    meta: "How narration is paced and how Slopify looks.",
  },
  {
    id: "notifications",
    label: "Notifications",
    meta: "When a run finishes, fails, or waits for you.",
  },
  {
    id: "channel-links",
    label: "Channel links",
    meta: "The links a YouTube description's {{Name}} placeholders fill from.",
  },
  {
    id: "studio",
    label: "YouTube Studio",
    meta: "The playlist upload packs name, and the Studio extension's pairing.",
  },
  {
    id: "storage",
    label: "Backup & storage",
    meta: "Export everything, import a backup, and see what uses disk space.",
  },
  {
    id: "backups",
    label: "Backups",
    meta: "A daily copy of everything, in a folder you choose.",
  },
  {
    id: "trash",
    label: "Trash",
    meta: "Deleted projects, prompts, templates and schedules, kept for 30 days.",
  },
  {
    id: "usage",
    label: "Usage",
    meta: "This machine only. The same counters, anonymised, feed slopify.stream.",
  },
  {
    id: "about",
    label: "About",
    meta: "Free and open source, running on your machine with your own keys.",
  },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["id"];

export function settingsSectionOf(value: unknown): SettingsSection {
  return settingsSections.find((section) => section.id === value)?.id ?? "providers";
}

// The browser's own download of the diagnostics file, the same one the header's link saves.
function downloadDiagnostics(origin: string): void {
  const link = document.createElement("a");
  link.href = `${origin}/api/diagnostics`;
  link.download = "slopify-diagnostics.json";
  document.body.append(link);
  link.click();
  link.remove();
}

// A settings rail beside one section at a time. The rail is the `section` search parameter,
// not a route, so the page title follows it; on phones the rail is a row of tabs that scrolls
// sideways on its own. Explanations sit behind the info buttons beside what they explain.
export function SettingsRoute({
  section = "providers",
  onSection = () => {},
}: {
  readonly section?: SettingsSection;
  readonly onSection?: (section: SettingsSection) => void;
}) {
  const { api } = useApp();
  const notify = useToast();
  const health = useProviderHealth();
  const backUp = useBackUpNow();
  const current = settingsSections.find((item) => item.id === section) ?? settingsSections[0];

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
      onSection("backups");
      backUp.mutate(undefined, {
        onError: (error) => {
          notify(
            `The backup didn't start: ${error.message} Open Settings → Backups to see its state.`,
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
          <>
            {section === "providers" ? (
              <Button disabled={health.isPending} onClick={() => health.mutate()}>
                {health.isPending ? "Checking…" : "Check all"}
              </Button>
            ) : null}
            <a
              className={buttonClass({ variant: "quiet" })}
              href={`${api.origin}/api/diagnostics`}
              download="slopify-diagnostics.json"
            >
              Download diagnostics
            </a>
          </>
        }
      />
      <Workspace
        sections={
          <Rail label="Settings sections">
            {settingsSections.map((item) => (
              <RailButton
                key={item.id}
                current={item.id === section}
                onClick={() => onSection(item.id)}
                className="whitespace-nowrap max-md:w-auto"
              >
                {item.label}
              </RailButton>
            ))}
          </Rail>
        }
      >
        <section aria-label={current.label} className="flex min-w-0 flex-col gap-10">
          {section === "providers" ? (
            <>
              <Welcome />
              <ProviderKeys />
              <ProviderHealthCheck run={health} />
            </>
          ) : null}
          {section === "general" ? <AutostartSettings /> : null}
          {section === "voices" ? <Voices /> : null}
          {section === "models" ? <CatalogueSettings /> : null}
          {section === "playback" ? <Playback /> : null}
          {section === "notifications" ? <NotificationSettings /> : null}
          {section === "channel-links" ? <ChannelLinksSettings /> : null}
          {section === "studio" ? <StudioSettings /> : null}
          {section === "storage" ? <StorageTools /> : null}
          {section === "storage" ? <SampleSettings /> : null}
          {section === "backups" ? <BackupSettings /> : null}
          {section === "trash" ? <TrashSettings /> : null}
          {section === "usage" ? <UsageBoard /> : null}
          {section === "about" ? <AboutSettings /> : null}
        </section>
      </Workspace>
    </div>
  );
}

type ExportState =
  | { readonly phase: "idle" }
  | { readonly phase: "preparing" }
  | { readonly phase: "downloading"; readonly bytes: number; readonly projects: number };

type ImportState =
  | { readonly phase: "idle" }
  | { readonly phase: "uploading"; readonly sent: number; readonly total: number }
  | { readonly phase: "importing" };

const importFailed =
  "The backup wasn't imported. Check it is a file made with Export everything (.tar) or Export backup (.zip), then try again.";

function StorageTools() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const usage = useQuery({
    queryKey: storageQueryKey,
    queryFn: () => readStorageUsage(api),
    staleTime: 30_000,
  });
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState<ExportState>({ phase: "idle" });
  const [importing, setImporting] = useState<ImportState>({ phase: "idle" });
  const [result, setResult] = useState<BackupImportSummary | null>(null);
  const notify = useToast();
  const [error, setError] = useState<string | null>(null);

  // Asked first, because a download link cannot show a refusal: the browser would save the
  // error as the backup. The download itself is the browser's, so a multi-gigabyte archive
  // goes straight to disk and its progress shows in the browser's downloads.
  async function exportEverything(): Promise<void> {
    setError(null);
    setExporting({ phase: "preparing" });
    try {
      const summary = await readBackupExportSummary(api);
      if (!summary.ready) {
        setExporting({ phase: "idle" });
        setError(summary.detail ?? "The backup can't be made right now. Try again in a moment.");
        return;
      }
      setExporting({
        phase: "downloading",
        bytes: summary.bytes ?? 0,
        projects: summary.projects ?? 0,
      });
      const link = document.createElement("a");
      link.href = `${api.origin}/api/storage/export`;
      link.download = "";
      document.body.append(link);
      link.click();
      link.remove();
    } catch (caught) {
      setExporting({ phase: "idle" });
      setError(
        caught instanceof Error
          ? caught.message
          : "The backup couldn't be prepared. Try again in a moment.",
      );
    }
  }

  async function importBackup(file: File): Promise<void> {
    // The settings-only backups older versions wrote are ZIPs, read whole in memory by the
    // server, so they keep their 100 MB limit. A full backup is a tar streamed to disk.
    const legacy = file.name.toLowerCase().endsWith(".zip") || file.type === "application/zip";
    if (file.size === 0 || (legacy && file.size > portableMaxUploadBytes)) {
      setError(
        legacy
          ? "This file is empty or larger than 100 MB. Choose a .zip made with Export backup, or a .tar made with Export everything."
          : "This file is empty. Choose the .tar made with Export everything.",
      );
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    setImporting({ phase: "uploading", sent: 0, total: file.size });
    try {
      const response = await api.upload(
        `${api.origin}/api/storage/import`,
        file,
        legacy ? "application/zip" : "application/x-tar",
        (sent, total) => {
          setImporting(
            sent >= total ? { phase: "importing" } : { phase: "uploading", sent, total },
          );
        },
      );
      const body = (await response.json()) as {
        detail?: string;
        templates?: number;
        fonts?: number;
        fontFallbacks?: number;
        stagedFiles?: number;
      } & Partial<BackupImportSummary>;
      if (!response.ok) throw new Error(body.detail ?? importFailed);
      if (body.projects !== undefined) {
        setResult(body as BackupImportSummary);
        notify("Backup imported.", "success");
      } else
        notify(
          `Imported ${body.templates ?? 0} template(s), ${body.fonts ?? 0} uploaded font(s), and ${body.stagedFiles ?? 0} staged file(s).${body.fontFallbacks ? ` ${body.fontFallbacks} missing legacy font reference(s) now use the default font.` : ""}`,
          "success",
        );
      await refreshPortableImportQueries(queryClient);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : importFailed);
    } finally {
      setImporting({ phase: "idle" });
      setBusy(false);
    }
  }

  async function cleanup(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const response = await api.fetch(`${api.origin}/api/storage/cleanup`, { method: "POST" });
      const body = (await response.json()) as { orphanFiles?: number; stagedFiles?: number };
      if (!response.ok) throw new Error("Clean orphan files didn't finish. Try again in a moment.");
      notify(
        `Removed ${body.orphanFiles ?? 0} orphan project file(s) and ${body.stagedFiles ?? 0} stale staged file(s).`,
        "success",
      );
      await queryClient.invalidateQueries({ queryKey: storageQueryKey });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Clean orphan files didn't finish. Try again in a moment.",
      );
    } finally {
      setBusy(false);
    }
  }

  useCommand({
    id: "settings.export-everything",
    title: "Export everything",
    group: "Settings",
    context: "Backup & storage",
    keywords: ["backup", "download"],
    run: () => {
      if (!busy && exporting.phase !== "preparing") void exportEverything();
    },
  });

  const working = busy || exporting.phase === "preparing";
  return (
    <>
      <div>
        <SectionHead
          title="Export and import"
          info="Export everything saves every project with its files and history, your prompts, intros and outros, document themes, templates, schedules, Play drafts, uploaded fonts, settings and usage history in one .tar file. Importing adds to this install and never replaces anything: projects already here are skipped, items whose name is taken arrive as “(imported)”, and schedules arrive paused. Projects that are being made must finish or be paused before exporting."
        >
          <Button disabled={working} onClick={() => void exportEverything()}>
            Export everything
          </Button>
          <label
            className={cn(
              buttonClass({ variant: "secondary" }),
              "cursor-pointer focus-within:outline-2 focus-within:outline-focus",
              working && "pointer-events-none opacity-50",
            )}
          >
            Import a backup
            <input
              className="sr-only"
              type="file"
              accept=".tar,application/x-tar,.zip,application/zip"
              disabled={working}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void importBackup(file);
                event.target.value = "";
              }}
            />
          </label>
          <Button variant="quiet" disabled={working} onClick={() => void cleanup()}>
            Clean orphan files
          </Button>
        </SectionHead>
        <div className="flex flex-col gap-2 text-small text-ink-2">
          <p className="m-0">
            Provider keys are never included in a backup. After importing, enter them again in
            Settings → Providers.
          </p>
          {exporting.phase === "preparing" ? (
            <p role="status" className="m-0 text-ink">
              Preparing the backup…
            </p>
          ) : null}
          {exporting.phase === "downloading" ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="m-0 min-w-0 flex-1 text-ink">
                Downloading {formatBytes(exporting.bytes)} ({exporting.projects} project
                {exporting.projects === 1 ? "" : "s"}). Your browser's downloads show its progress;
                keep Slopify running until it finishes.
              </p>
              <Button variant="quiet" size="small" onClick={() => setExporting({ phase: "idle" })}>
                Dismiss
              </Button>
            </div>
          ) : null}
          {importing.phase === "uploading" ? (
            <div className="flex flex-col gap-2">
              <p role="status" className="m-0 text-ink tabular-nums">
                Uploading the backup: {formatBytes(importing.sent)} of{" "}
                {formatBytes(importing.total)}
              </p>
              <Meter
                label="Backup upload"
                value={importing.total === 0 ? 0 : importing.sent / importing.total}
              />
            </div>
          ) : null}
          {importing.phase === "importing" ? (
            <p role="status" className="m-0 text-ink">
              Checking and importing the backup… large projects can take a minute.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-danger">
              {error}
            </p>
          ) : null}
        </div>
      </div>
      {result ? <ImportResult result={result} onDismiss={() => setResult(null)} /> : null}
      <div>
        <SectionHead
          title="Disk space"
          meta={
            usage.data ? (
              <>
                <span className="font-semibold text-ink">
                  {formatBytes(usage.data.data)} stored
                </span>
                <span className="tabular-nums">
                  {" "}
                  · {formatBytes(usage.data.projects)} project files ·{" "}
                  {formatBytes(usage.data.staging)} staged files
                </span>
              </>
            ) : usage.error ? (
              "Storage usage is unavailable. Reload the page to try again."
            ) : (
              <span className="inline-block h-4 w-48 rounded-control bg-raised" />
            )
          }
        />
        {usage.data && usage.data.byProject.length > 0 ? (
          <ProjectStorageList projects={usage.data.byProject} queryKey={[...storageQueryKey]} />
        ) : null}
      </div>
    </>
  );
}

function counted(label: string, counts: ItemCounts | undefined): string | null {
  if (counts === undefined) return null;
  const parts = [
    counts.added > 0 ? `${counts.added} added` : null,
    counts.renamed > 0
      ? `${counts.renamed} added as “(imported)” because the name was taken`
      : null,
    counts.skipped > 0 ? `${counts.skipped} already here` : null,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : `${label}: ${parts.join(", ")}.`;
}

// What the last import brought in and what it left out, so nothing is skipped silently.
export function ImportResult({
  result,
  onDismiss,
}: {
  readonly result: BackupImportSummary;
  readonly onDismiss: () => void;
}) {
  const lines = [
    result.projects.imported.length > 0
      ? `Projects: ${result.projects.imported.length} added (${formatBytes(result.files.bytes)} of files).`
      : "Projects: none added.",
    counted("Prompts", result.prompts),
    counted("Intros and outros", result.entries),
    counted("Channels", result.channels),
    counted("Cast members", result.cast),
    counted("Episode memories", result.episodeMemories),
    counted("Existing videos", result.channelVideos),
    counted("Document themes", result.documentThemes),
    counted("Templates", result.templates),
    counted("Schedules", result.schedules),
    result.schedules.paused > 0
      ? `${result.schedules.paused} schedule(s) arrived paused so two installs never run them both; resume them on the Schedules screen.`
      : null,
    counted("Voices", result.voices),
    counted("Play drafts", result.drafts),
    result.settings.added + result.settings.kept > 0
      ? `Settings: ${result.settings.added} filled in${result.settings.kept > 0 ? `, ${result.settings.kept} kept as this install has them` : ""}.`
      : null,
    result.fonts > 0 ? `Uploaded fonts: ${result.fonts} added.` : null,
    result.usage.alreadyImported
      ? "Usage: this backup's history was already added before, so it wasn't counted twice."
      : `Usage: ${result.usage.events} recorded event(s) added to the totals.`,
    "Provider keys are not in backups: enter them in Settings → Providers.",
  ].filter((line) => line !== null);
  return (
    <div>
      <SectionHead
        as="h3"
        title={`Imported the backup from ${result.backup.createdAt.slice(0, 10)}`}
      >
        <Button variant="quiet" size="small" onClick={onDismiss}>
          Dismiss
        </Button>
      </SectionHead>
      <ul aria-label="Import result" className="m-0 list-disc pl-5 text-small text-ink-2">
        {lines.map((line) => (
          <li key={line} className="py-0.5">
            {line}
          </li>
        ))}
        {result.projects.skipped.map((project) => (
          <li key={project.id} className="py-0.5">
            Skipped “{project.title}”: {project.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Playback() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery(api));

  const [typed, setTyped] = useState<string | undefined>(undefined);
  const [saved, setSaved] = useState(false);

  const save = useMutation({
    mutationFn: (next: AppSettings) => saveAppSettings(api, next),
    // Switching theme is immediate, and the
    // cache is what components/theme.tsx paints from, so the write happens before the
    // request and is rolled back if the request refuses it.
    onMutate: (next: AppSettings) => {
      const previous = queryClient.getQueryData<AppSettings>(keys.settings);
      queryClient.setQueryData(keys.settings, next);
      return { previous };
    },
    onError: (_error: Error, _next: AppSettings, context) => {
      if (context?.previous !== undefined) {
        queryClient.setQueryData(keys.settings, context.previous);
      }
    },
    onSuccess: (body) => {
      queryClient.setQueryData(keys.settings, body);
    },
  });

  useEffect(() => {
    if (!saved) {
      return;
    }
    const timer = setTimeout(() => {
      setSaved(false);
    }, savedTickMs);
    return () => {
      clearTimeout(timer);
    };
  }, [saved]);

  if (settings.error !== null) {
    return (
      <p role="alert" className="m-0 text-body text-danger">
        {settings.error.message}
      </p>
    );
  }
  if (settings.data === undefined) {
    return (
      <div className="grid gap-6 md:grid-cols-2" role="status" aria-label="Loading settings">
        <span className="h-16 rounded-control bg-raised" />
        <span className="h-16 rounded-control bg-raised" />
      </div>
    );
  }

  const current = settings.data;
  const gap = typed ?? String(current.silenceGapSeconds);
  const problem = gapProblem(gap);

  return (
    <div className="grid items-start gap-6 md:grid-cols-2">
      <Field
        label="Silence between segments"
        help="Seconds of quiet between narrated segments."
        error={problem ?? save.error?.message}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={silenceGapSecondsMax}
            step={1}
            className="w-[88px] tabular-nums"
            value={gap}
            aria-invalid={problem !== undefined}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <span className="text-small text-ink-2">seconds</span>
          <Button
            variant="primary"
            disabled={problem !== undefined || save.isPending}
            onClick={() => {
              setSaved(false);
              save.mutate(
                { silenceGapSeconds: Number(gap.trim()), appearance: current.appearance },
                {
                  onSuccess: () => {
                    setTyped(undefined);
                    setSaved(true);
                  },
                },
              );
            }}
          >
            Save
          </Button>
          <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
        </div>
      </Field>

      <div className="sl-field">
        <span className="sl-field__label">Appearance</span>
        <Segmented
          label="Appearance"
          value={current.appearance}
          options={appearances}
          className="self-start"
          onChange={(next) => {
            save.mutate({ silenceGapSeconds: current.silenceGapSeconds, appearance: next });
          }}
        />
      </div>
    </div>
  );
}
