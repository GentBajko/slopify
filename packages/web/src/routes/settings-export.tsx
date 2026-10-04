import type { ItemCounts } from "@app/slices/storage/backup-import.js";
import { type QueryClient, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { type BackupImportSummary, readBackupExportSummary, readStorageUsage } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { InfoTip } from "@/components/kit/info-tip";
import { SectionHead } from "@/components/kit/section-head";
import { Meter } from "@/components/kit/stats";
import { useToast } from "@/components/kit/toast";
import { keys } from "@/queries";
import { schedulesKey } from "@/schedules/api";
import { fontsKey } from "@/subtitles/api";
import { templatesKey } from "@/templates/api";
import { formatBytes, ProjectStorageList } from "./settings-storage";

// Settings → Backup & storage: export everything, import a backup, clean up, and the disk
// space each project takes.

export const storageQueryKey = ["storage-usage"] as const;
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

export function StorageTools() {
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
      if (!response.ok)
        throw new Error("Clear leftover files didn't finish. Try again in a moment.");
      notify(
        `Cleared ${body.orphanFiles ?? 0} leftover project file(s) and ${body.stagedFiles ?? 0} unused upload(s).`,
        "success",
      );
      await queryClient.invalidateQueries({ queryKey: storageQueryKey });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Clear leftover files didn't finish. Try again in a moment.",
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
  const backupFile = useRef<HTMLInputElement>(null);
  return (
    <>
      <div>
        <SectionHead title="Export and import" info="settings.storage.export">
          <Button disabled={working} onClick={() => void exportEverything()}>
            Export everything
          </Button>
          <Button disabled={working} onClick={() => backupFile.current?.click()}>
            Import a backup
          </Button>
          <input
            ref={backupFile}
            className="sr-only"
            type="file"
            tabIndex={-1}
            aria-label="Import a backup"
            accept=".tar,application/x-tar,.zip,application/zip"
            disabled={working}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importBackup(file);
              event.target.value = "";
            }}
          />
          <span className="inline-flex items-center gap-1">
            <Button variant="quiet" disabled={working} onClick={() => void cleanup()}>
              Clear leftover files
            </Button>
            <InfoTip id="settings.storage.clean" />
          </span>
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
                progress
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
          info="settings.storage.disk"
          meta={
            usage.data ? (
              <>
                <span className="font-semibold text-ink">
                  {formatBytes(usage.data.data)} stored
                </span>
                <span className="tabular-nums">
                  {" "}
                  · {formatBytes(Math.max(0, usage.data.projects - usage.data.trash.bytes))} project
                  files · {formatBytes(usage.data.staging)} staged files
                  {usage.data.trash.projects > 0
                    ? ` · ${formatBytes(usage.data.trash.bytes)} in the trash (${trashedProjects(usage.data.trash.projects)}), freed when removed for good`
                    : null}
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

// Deleted projects keep their folders for 30 days (Settings → Trash), so their space only
// comes back once Delete now or the daily purge removes them for good.
function trashedProjects(count: number): string {
  return count === 1 ? "1 deleted project" : `${String(count)} deleted projects`;
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
    counted("PDF themes", result.documentThemes),
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
