import type { BackupConfigInput, BackupView } from "@app/slices/backups/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { readBackups, runBackupNow, saveBackups } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { Switch } from "@/components/kit/switch";
import { useToast } from "@/components/kit/toast";
import { UnsavedStatus } from "@/components/save-state";
import { SavedTick, savedTickMs } from "@/components/saved-tick";
import { fileSize } from "@/lib/format";

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

// Back up now, from the section's button or from Ctrl+K anywhere on Settings.
export function useBackUpNow() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const notify = useToast();
  return useMutation({
    mutationFn: () => runBackupNow(api),
    onSuccess: (view: BackupView) => {
      queryClient.setQueryData(backupsQueryKey, view);
      notify("Backup started. Its result shows here when it finishes.", "success");
    },
  });
}

export function BackupSettings() {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const backups = useQuery({
    queryKey: backupsQueryKey,
    queryFn: () => readBackups(api),
    // While a backup is being written its result is polled; otherwise the view is quiet.
    refetchInterval: (query) => (query.state.data?.running === true ? 2000 : false),
  });
  const [draft, setDraft] = useState<Draft | undefined>(undefined);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: (config: BackupConfigInput) => saveBackups(api, config),
    onSuccess: (view) => {
      queryClient.setQueryData(backupsQueryKey, view);
      setDraft(undefined);
      setSaved(true);
    },
  });
  const run = useBackUpNow();

  useEffect(() => {
    if (!saved) return;
    const timer = setTimeout(() => setSaved(false), savedTickMs);
    return () => clearTimeout(timer);
  }, [saved]);

  const view = backups.data;
  const current = draft ?? (view === undefined ? undefined : draftOf(view));
  const keepError = current === undefined ? undefined : keepProblem(current.keep);
  const dirty = draft !== undefined && view !== undefined && !sameDraft(draft, draftOf(view));
  const submit = (): void => {
    if (current === undefined || keepError !== undefined || save.isPending) return;
    setSaved(false);
    save.mutate({
      enabled: current.enabled,
      time: current.time,
      timeZone: browserTimeZone(),
      keep: Number(current.keep.trim()),
      folder: current.folder.trim() === "" ? null : current.folder.trim(),
    });
  };
  const edit = (patch: Partial<Draft>): void => {
    if (current !== undefined) setDraft({ ...current, ...patch });
  };

  return (
    <div>
      <SectionHead title="Daily backup" info="settings.backups">
        {/* Secondary: the section's one primary is its form's Save. */}
        <Button
          disabled={view === undefined || view.running || run.isPending}
          onClick={() => run.mutate()}
        >
          Back up now
        </Button>
      </SectionHead>
      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap justify-between gap-x-4 gap-y-1 text-small text-ink-2">
          <span role="status">
            {view === undefined ? (
              <span className="inline-block h-4 w-48 rounded-control bg-raised" />
            ) : (
              lastLine(view)
            )}
          </span>
          <span>{view === undefined ? null : nextLine(view)}</span>
        </div>
        {view?.status.detail ? (
          view.status.lastResult === "failed" ? (
            <Callout tone="danger" title="Why the last backup stopped">
              {view.status.detail}
            </Callout>
          ) : (
            <p className="m-0 text-small text-ink-2">{view.status.detail}</p>
          )
        ) : null}
        {run.error ? (
          <p role="alert" className="m-0 text-small text-danger">
            {run.error.message}
          </p>
        ) : null}
      </div>
      {backups.error ? (
        <p role="alert" className="m-0 text-small text-danger">
          The backup settings couldn't be read: {backups.error.message}
        </p>
      ) : (
        // One form: the switch and the fields below it are kept together by Save (or Enter in a
        // field), and the line beside Save says when something is waiting for it.
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Switch
            label="Back up automatically"
            tip="settings.backups.auto"
            checked={current?.enabled === true}
            disabled={current === undefined}
            className="self-start"
            onChange={(next) => edit({ enabled: next })}
          />
          <div className="grid items-start gap-6 md:grid-cols-2">
            <Field
              label="Time of day"
              tip="settings.backups.time"
              help={`${browserTimeZone()} time`}
            >
              <Input
                type="time"
                className="w-[140px] tabular-nums"
                value={current?.time ?? "03:00"}
                disabled={current === undefined}
                onChange={(event) => edit({ time: event.target.value })}
              />
            </Field>
            <Field
              label="Keep last"
              tip="settings.backups.keep"
              help="Backups kept in the folder."
              error={keepError}
            >
              <Input
                type="number"
                inputMode="numeric"
                min={keepMin}
                max={keepMax}
                step={1}
                className="w-[88px] tabular-nums"
                value={current?.keep ?? "5"}
                disabled={current === undefined}
                onChange={(event) => edit({ keep: event.target.value })}
              />
            </Field>
            <Field
              label="Folder"
              tip="settings.backups.folder"
              className="md:col-span-2"
              {...(view === undefined ? {} : { help: whereLine(view) })}
            >
              <Input
                value={current?.folder ?? ""}
                placeholder={view?.defaultFolder ?? ""}
                disabled={current === undefined}
                onChange={(event) => edit({ folder: event.target.value })}
              />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              disabled={!dirty || keepError !== undefined || save.isPending}
              disabledReason={
                keepError === undefined ? "Nothing changed since the last save." : keepError
              }
            >
              Save
            </Button>
            <span className="inline-flex w-[52px]">{saved ? <SavedTick /> : null}</span>
            <UnsavedStatus
              dirty={dirty}
              onDiscard={() => {
                save.reset();
                setDraft(undefined);
              }}
            />
            {save.error === null ? null : (
              <p role="alert" className="m-0 basis-full text-small text-danger">
                {save.error.message}
              </p>
            )}
          </div>
        </form>
      )}
    </div>
  );
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.enabled === b.enabled &&
    a.time === b.time &&
    a.keep.trim() === b.keep.trim() &&
    a.folder.trim() === b.folder.trim()
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
    return `Inside Slopify's Docker volume, not on your computer. Leave Folder empty to save backups in the Backups folder on your computer. ${kept}`;
  const empty = view.config.folder === null ? "Empty uses the default: " : "On your computer: ";
  return `${empty}${view.hostFolder}. ${kept}`;
}

const formatBytes = fileSize;
