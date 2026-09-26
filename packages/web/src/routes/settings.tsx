import type { Appearance, AppSettings } from "@app/slices/settings/model.js";
import type { ItemCounts } from "@app/slices/storage/backup-import.js";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import {
  type BackupImportSummary,
  readBackupExportSummary,
  readStorageUsage,
  saveAppSettings,
} from "@/api";
import { useApp } from "@/app-context";
import { CatalogueSettings } from "@/components/catalogue";
import { PageBar } from "@/components/kit/page-bar";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { ProviderKeys } from "@/components/provider-keys";
import { Rail, RailGroup, RailMeter } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Voices } from "@/components/voices";
import { cn } from "@/lib/utils";
import { keys, settingsQuery } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { fontsKey } from "@/subtitles/api";
import { templatesKey } from "@/templates/api";
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

export const settingsSections = [
  { id: "providers", label: "Providers" },
  { id: "voices", label: "Voices" },
  { id: "models", label: "Models" },
  { id: "playback", label: "Playback & appearance" },
  { id: "storage", label: "Backup & storage" },
  { id: "usage", label: "Usage" },
] as const;

export type SettingsSection = (typeof settingsSections)[number]["id"];

export function settingsSectionOf(value: unknown): SettingsSection {
  return settingsSections.find((section) => section.id === value)?.id ?? "providers";
}

// One section on screen at a time, picked from the list on the left. Each section is a dense
// list; explanations sit behind the info buttons beside what they explain.
export function SettingsRoute({
  section = "providers",
  onSection = () => {},
}: {
  readonly section?: SettingsSection;
  readonly onSection?: (section: SettingsSection) => void;
}) {
  const { api } = useApp();
  const current = settingsSections.find((item) => item.id === section) ?? settingsSections[0];
  return (
    <div>
      <PageBar
        title="Settings"
        actions={
          <Button asChild variant="ghost">
            <a href={`${api.origin}/api/diagnostics`} download="slopify-diagnostics.json">
              Download diagnostics
            </a>
          </Button>
        }
      />
      <div className="grid min-w-0 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="min-w-0">
          <ul className="flex gap-1 overflow-x-auto border-b border-line pb-2 [scrollbar-width:none] md:flex-col md:border-b-0 md:pb-0">
            {settingsSections.map((item) => (
              <li key={item.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={item.id === section ? "page" : undefined}
                  onClick={() => onSection(item.id)}
                  className={cn(
                    "flex min-h-9 w-full items-center rounded-control px-3 text-left whitespace-nowrap",
                    item.id === section
                      ? "bg-panel2 font-semibold text-ink shadow-[inset_2px_0_0_var(--color-lamp-run)]"
                      : "text-ink2 hover:bg-panel2 hover:text-ink",
                  )}
                >
                  {item.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
        <section aria-label={current.label} className="min-w-0">
          {section === "providers" ? (
            <SectionHead
              title="Providers"
              info="Provider readiness is checked again before each run. Keys stay on this machine and go only to the provider they belong to."
            />
          ) : null}
          {section === "providers" ? <ProviderKeys /> : null}
          {section === "voices" ? (
            <SectionHead
              title="Voices"
              info="A wrong voice ID is discovered when the audio stage uses it."
            />
          ) : null}
          {section === "voices" ? <Voices /> : null}
          {section === "models" ? <CatalogueSettings /> : null}
          {section === "playback" ? <SectionHead title="Playback & appearance" /> : null}
          {section === "playback" ? <Playback /> : null}
          {section === "storage" ? <StorageTools /> : null}
          {section === "usage" ? (
            <SectionHead
              title="Usage"
              info="This machine only. The same counters, anonymised, feed slopify.stream."
            />
          ) : null}
          {section === "usage" ? <UsageBoard /> : null}
        </section>
      </div>
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

  const working = busy || exporting.phase === "preparing";
  return (
    <div>
      <SectionHead
        title="Backup & storage"
        info="Export everything saves every project with its files and history, your prompts, intros and outros, document themes, templates, schedules, Play drafts, uploaded fonts, settings and usage history in one .tar file. Importing adds to this install and never replaces anything: projects already here are skipped, items whose name is taken arrive as “(imported)”, and schedules arrive paused. Projects that are being made must finish or be paused before exporting."
      >
        <Button type="button" disabled={working} onClick={() => void exportEverything()}>
          Export everything
        </Button>
        <label className="inline-flex h-8 cursor-pointer items-center rounded-control border border-line2 bg-panel2 px-3 text-body hover:border-ink3">
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
        <Button type="button" variant="ghost" disabled={working} onClick={() => void cleanup()}>
          Clean orphan files
        </Button>
      </SectionHead>
      <RailGroup className="mb-4">
        <Rail className="text-small text-ink2">
          Provider keys are never included in a backup. After importing, enter them again in
          Settings → Providers.
        </Rail>
        {exporting.phase === "preparing" ? (
          <Rail className="text-small">
            <span role="status">Preparing the backup…</span>
          </Rail>
        ) : null}
        {exporting.phase === "downloading" ? (
          <Rail className="flex-wrap justify-between gap-y-1 text-small">
            <span role="status">
              Downloading {formatBytes(exporting.bytes)} ({exporting.projects} project
              {exporting.projects === 1 ? "" : "s"}). Your browser's downloads show its progress;
              keep Slopify running until it finishes.
            </span>
            <Button type="button" variant="ghost" onClick={() => setExporting({ phase: "idle" })}>
              Dismiss
            </Button>
          </Rail>
        ) : null}
        {importing.phase === "uploading" ? (
          <Rail className="text-small">
            <span role="status" className="tabular-nums">
              Uploading the backup: {formatBytes(importing.sent)} of {formatBytes(importing.total)}
            </span>
            <RailMeter current={importing.sent} total={importing.total} />
          </Rail>
        ) : null}
        {importing.phase === "importing" ? (
          <Rail className="text-small">
            <span role="status">
              Checking and importing the backup… large projects can take a minute.
            </span>
          </Rail>
        ) : null}
      </RailGroup>
      {result ? <ImportResult result={result} onDismiss={() => setResult(null)} /> : null}
      <RailGroup>
        {usage.data ? (
          <>
            <Rail className="flex-wrap justify-between gap-y-1 text-small text-ink2">
              <span className="font-semibold text-ink">{formatBytes(usage.data.data)} stored</span>
              <span className="tabular-nums">
                {formatBytes(usage.data.projects)} project files · {formatBytes(usage.data.staging)}{" "}
                staged files
              </span>
            </Rail>
            {usage.data.byProject.length > 0 ? (
              <ul aria-label="Storage by project">
                {usage.data.byProject.slice(0, 5).map((project) => (
                  <li
                    key={project.id}
                    className="flex justify-between gap-4 border-b border-line px-4 py-2 text-small text-ink2 last:border-b-0"
                  >
                    <span className="truncate">{project.title}</span>
                    <span className="shrink-0 tabular-nums">{formatBytes(project.bytes)}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : usage.error ? (
          <Rail className="text-small text-ink2">Storage usage is unavailable.</Rail>
        ) : (
          <Rail>
            <span className="h-4 w-48 rounded-control bg-panel2" />
          </Rail>
        )}
      </RailGroup>
      {error ? (
        <p role="alert" className="mt-2 text-small text-red">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function counted(label: string, counts: ItemCounts): string | null {
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
    <RailGroup className="mb-4">
      <Rail className="flex-wrap justify-between gap-y-1">
        <span className="font-semibold">
          Imported the backup from {result.backup.createdAt.slice(0, 10)}
        </span>
        <Button type="button" variant="ghost" onClick={onDismiss}>
          Dismiss
        </Button>
      </Rail>
      <ul aria-label="Import result" className="px-4 py-2 text-small text-ink2">
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
    </RailGroup>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = units[0] ?? "KB";
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024 || candidate === units.at(-1)) break;
  }
  const rounded = value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "");
  return `${rounded} ${unit}`;
}

function Playback() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const settings = useQuery(settingsQuery(api));
  const gapId = useId();
  const gapErrorId = useId();
  const appearanceLabelId = useId();

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
      <RailGroup>
        <Rail>
          <p className="text-body text-red">{settings.error.message}</p>
        </Rail>
      </RailGroup>
    );
  }
  if (settings.data === undefined) {
    return (
      <RailGroup>
        <Rail>
          <span className="h-4 w-48 rounded-control bg-panel2" />
          <span className="h-8 w-[72px] rounded-control bg-panel2" />
        </Rail>
      </RailGroup>
    );
  }

  const current = settings.data;
  const gap = typed ?? String(current.silenceGapSeconds);
  const problem = gapProblem(gap);

  return (
    <RailGroup>
      <div className="grid sm:grid-cols-[240px_1fr] items-center gap-[14px] border-b border-line px-4 py-[14px]">
        <label htmlFor={gapId} className="font-semibold">
          Silence between segments
        </label>
        <div className="flex flex-wrap items-center gap-[10px]">
          <Input
            id={gapId}
            type="number"
            inputMode="numeric"
            min={0}
            max={silenceGapSecondsMax}
            step={1}
            className="w-[72px] tabular-nums"
            value={gap}
            aria-invalid={problem !== undefined}
            aria-describedby={problem === undefined ? undefined : gapErrorId}
            onChange={(event) => {
              setTyped(event.target.value);
            }}
          />
          <span className="text-small text-ink2">seconds</span>
          <Button
            className="ml-[6px]"
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
          {problem === undefined ? null : (
            <p id={gapErrorId} className="basis-full text-label text-red">
              {problem}
            </p>
          )}
          {save.error === null ? null : (
            <p className="basis-full text-label text-red">{save.error.message}</p>
          )}
        </div>
      </div>

      <div className="grid items-center gap-[14px] px-4 py-[14px] sm:grid-cols-[240px_1fr]">
        <span id={appearanceLabelId} className="font-semibold">
          Appearance
        </span>
        <ToggleGroup
          type="single"
          value={current.appearance}
          aria-labelledby={appearanceLabelId}
          className="justify-self-start"
          onValueChange={(next) => {
            const picked = appearances.find((option) => option.value === next);
            if (picked !== undefined) {
              save.mutate({
                silenceGapSeconds: current.silenceGapSeconds,
                appearance: picked.value,
              });
            }
          }}
        >
          {appearances.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
    </RailGroup>
  );
}
