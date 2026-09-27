import type { BackupConfigInput, BackupView } from "@app/slices/backups/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState } from "react";
import { readBackups, runBackupNow, saveBackups } from "@/api";
import { useApp } from "@/app-context";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { Rail, RailGroup } from "@/components/rail";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

export const backupsQueryKey = ["backups"] as const;
const keepMin = 1;
const keepMax = 30;

function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

// The same bounds the server checks (slices/backups/model.ts), so Save refuses what it would.
export function keepProblem(value: string): string | undefined {
  const trimmed = value.trim();
  return /^\d+$/.test(trimmed) && Number(trimmed) >= keepMin && Number(trimmed) <= keepMax
    ? undefined
    : `Keep between ${keepMin} and ${keepMax} backups.`;
}

interface Draft {
  readonly enabled: boolean;
  readonly time: string;
  readonly keep: string;
  readonly folder: string;
}

function draftOf(view: BackupView): Draft {
  return {
    enabled: view.config.enabled,
    time: view.config.time,
    keep: String(view.config.keep),
    folder: view.config.folder ?? "",
  };
}

export function BackupSettings() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  const backups = useQuery({
    queryKey: backupsQueryKey,
    queryFn: () => readBackups(api),
    // While a backup is being written its result is polled; otherwise the view is quiet.
    refetchInterval: (query) => (query.state.data?.running === true ? 2000 : false),
  });
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const toggleId = useId();
  const timeId = useId();
  const keepId = useId();
  const keepErrorId = useId();
  const folderId = useId();

  const save = useMutation({
    mutationFn: (config: BackupConfigInput) => saveBackups(api, config),
    onSuccess: (view) => {
      queryClient.setQueryData(backupsQueryKey, view);
      setDraft(undefined);
      setSaved(true);
    },
  });
  const run = useMutation({
    mutationFn: () => runBackupNow(api),
    onSuccess: (view) => {
      queryClient.setQueryData(backupsQueryKey, view);
      notify("Backup started. Its result shows here when it finishes.", "success");
    },
  });

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), savedTickMs);
    return () => clearTimeout(timer);
  }, [saved]);

  const view = backups.data;
  const current = draft ?? (view === undefined ? undefined : draftOf(view));
  const keepError = current === undefined ? undefined : keepProblem(current.keep);
  const edit = (patch: Partial<Draft>): void => {
    if (current !== undefined) setDraft({ ...current, ...patch });
  };

  return (
    <div>
      <SectionHead
        title="Backups"
        info="Once a day Slopify writes the same file Export everything downloads (every project with its files, your library, templates, schedules, settings and usage; never provider keys) into the backup folder, and deletes its own oldest backups beyond the number you keep. Nothing else in the folder is touched. A backup waits while projects are being made, because their files are still being written. If Slopify was off at the backup time, it backs up a couple of minutes after it starts again."
      >
        <Button
          type="button"
          disabled={view === undefined || view.running || run.isPending}
          onClick={() => run.mutate()}
        >
          Back up now
        </Button>
      </SectionHead>
      <RailGroup className="mb-4">
        <Rail className="flex-wrap justify-between gap-y-1 text-small">
          <span role="status" className="text-ink2">
            {view === undefined ? (
              <span className="inline-block h-4 w-48 rounded-control bg-panel2" />
            ) : (
              lastLine(view)
            )}
          </span>
          <span className="text-ink2">{view === undefined ? null : nextLine(view)}</span>
        </Rail>
        {view?.status.detail ? (
          <Rail
            className={
              view.status.lastResult === "failed" ? "text-small text-red" : "text-small text-ink2"
            }
          >
            {view.status.detail}
          </Rail>
        ) : null}
        {run.error ? (
          <Rail className="text-small text-red">
            <span role="alert">{run.error.message}</span>
          </Rail>
        ) : null}
      </RailGroup>
      {backups.error ? (
        <RailGroup>
          <Rail className="text-small text-red">{backups.error.message}</Rail>
        </RailGroup>
      ) : (
        <RailGroup>
          <Row label="Back up automatically" labelId={toggleId}>
            <ToggleGroup
              type="single"
              value={current?.enabled === true ? "on" : "off"}
              aria-labelledby={toggleId}
              disabled={current === undefined}
              onValueChange={(next) => {
                if (next === "on" || next === "off") edit({ enabled: next === "on" });
              }}
            >
              <ToggleGroupItem value="off">Off</ToggleGroupItem>
              <ToggleGroupItem value="on">On</ToggleGroupItem>
            </ToggleGroup>
          </Row>
          <Row label="Time of day" htmlFor={timeId}>
            <Input
              id={timeId}
              type="time"
              className="w-[120px] tabular-nums"
              value={current?.time ?? "03:00"}
              disabled={current === undefined}
              onChange={(event) => edit({ time: event.target.value })}
            />
            <span className="text-small text-ink2">{browserTimeZone()} time</span>
          </Row>
          <Row label="Keep last" htmlFor={keepId}>
            <Input
              id={keepId}
              type="number"
              inputMode="numeric"
              min={keepMin}
              max={keepMax}
              step={1}
              className="w-[72px] tabular-nums"
              value={current?.keep ?? "5"}
              disabled={current === undefined}
              aria-invalid={keepError !== undefined}
              aria-describedby={keepError === undefined ? undefined : keepErrorId}
              onChange={(event) => edit({ keep: event.target.value })}
            />
            <span className="text-small text-ink2">backups</span>
            {keepError === undefined ? null : (
              <p id={keepErrorId} className="basis-full text-label text-red">
                {keepError}
              </p>
            )}
          </Row>
          <Row label="Folder" htmlFor={folderId}>
            <Input
              id={folderId}
              className="min-w-0 flex-1"
              value={current?.folder ?? ""}
              placeholder={view?.defaultFolder ?? ""}
              disabled={current === undefined}
              onChange={(event) => edit({ folder: event.target.value })}
            />
            {view === undefined ? null : (
              <p className="basis-full text-label text-ink2">{whereLine(view)}</p>
            )}
          </Row>
          <div className="flex flex-wrap items-center gap-[10px] px-4 py-[14px]">
            <Button
              disabled={current === undefined || keepError !== undefined || save.isPending}
              onClick={() => {
                if (current === undefined) return;
                setSaved(false);
                save.mutate({
                  enabled: current.enabled,
                  time: current.time,
                  timeZone: browserTimeZone(),
                  keep: Number(current.keep.trim()),
                  folder: current.folder.trim() === "" ? null : current.folder.trim(),
                });
              }}
            >
              Save
            </Button>
            <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
            {save.error === null ? null : (
              <p role="alert" className="basis-full text-label text-red">
                {save.error.message}
              </p>
            )}
          </div>
        </RailGroup>
      )}
    </div>
  );
}

function Row({
  label,
  htmlFor,
  labelId,
  children,
}: {
  readonly label: string;
  readonly htmlFor?: string;
  readonly labelId?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="grid items-center gap-[14px] border-b border-line px-4 py-[14px] sm:grid-cols-[240px_1fr]">
      {htmlFor === undefined ? (
        <span id={labelId} className="font-semibold">
          {label}
        </span>
      ) : (
        <label htmlFor={htmlFor} className="font-semibold">
          {label}
        </label>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-[10px]">{children}</div>
    </div>
  );
}

function when(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function lastLine(view: BackupView): string {
  if (view.running) return "Backing up now…";
  const { status } = view;
  const success =
    status.lastSuccessAt === null
      ? "No backup yet."
      : `Last backup ${when(status.lastSuccessAt)}${status.lastSuccessBytes === null ? "" : `, ${formatBytes(status.lastSuccessBytes)}`}.`;
  if (status.lastResult === "failed" && status.lastAttemptAt !== null)
    return `${success} The backup at ${when(status.lastAttemptAt)} failed.`;
  if (status.lastResult === "waiting") return `${success} Waiting for projects to finish.`;
  return success;
}

function nextLine(view: BackupView): string {
  if (!view.config.enabled) return "Automatic backups are off.";
  if (view.overdue) return "Next: shortly.";
  return view.nextRunAt === null ? "" : `Next: ${when(view.nextRunAt)}.`;
}

function whereLine(view: BackupView): string {
  const kept = `${view.files.length} backup${view.files.length === 1 ? "" : "s"} here (${formatBytes(view.files.reduce((sum, file) => sum + file.bytes, 0))}).`;
  if (view.hostFolder === null)
    return `Inside Slopify's Docker volume, not on your computer. Leave Folder empty to save backups in your projects folder on your computer. ${kept}`;
  const empty = view.config.folder === null ? "Empty uses the default: " : "On your computer: ";
  return `${empty}${view.hostFolder}. ${kept}`;
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
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, "")} ${unit}`;
}
