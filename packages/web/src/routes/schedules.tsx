import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  CalendarClockIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  PauseIcon,
  PlayIcon,
  XIcon,
} from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import {
  deleteSchedule,
  readSchedule,
  scheduleAction,
  schedulesKey,
  schedulesQuery,
} from "@/schedules/api";
import { ScheduleForm } from "@/schedules/form";
import { formatScheduleDate } from "@/schedules/time";
import { templatesQuery } from "@/templates/api";

export function SchedulesRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<ScheduleSummary | null>(null);
  const [formBusy, setFormBusy] = useState(false);
  const active = useRef(false);
  const liveSchedules = schedules.data?.filter((schedule) => schedule.deletedAt === null) ?? [];
  const deletedSchedules = schedules.data?.filter((schedule) => schedule.deletedAt !== null) ?? [];
  const mutation = useMutation({
    onError: (cause: Error) => setError(cause.message),
    onSettled: async () => {
      active.current = false;
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
    },
    mutationFn: async (
      job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
    ) => job(),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
    },
  });

  const act = (
    job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
  ) => {
    if (active.current) return;
    active.current = true;
    setNotice(null);
    setError(null);
    mutation.mutate(job);
  };

  return (
    <div className="mx-auto max-w-[1200px] space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-title font-bold tracking-[-0.01em]">
          <CalendarClockIcon aria-hidden="true" className="size-6 text-lamp-run" />
          Schedules
        </h1>
        <p className="mt-2 max-w-[70ch] text-body text-ink2">
          Run a saved template on this machine at a predictable local time. Each schedule keeps a
          durable history and creates fresh projects, so changing a template never rewrites an old
          run.
        </p>
      </div>
      <ScheduleForm
        onBusy={setFormBusy}
        key={editing?.id ?? "new"}
        editing={editing}
        onCancel={() => {
          setEditing(null);
          setError(null);
        }}
        templates={templates.data ?? []}
        pending={mutation.isPending}
        onCreated={() => {
          setNotice(
            editing
              ? "Schedule updated."
              : "Schedule saved. It will run automatically while Slopify is open.",
          );
          setEditing(null);
          setError(null);
          void queryClient.invalidateQueries({ queryKey: schedulesKey });
        }}
        onError={(message) => {
          setError(message);
          void queryClient.invalidateQueries({ queryKey: schedulesKey });
        }}
      />
      {templates.data?.length === 0 ? (
        <p className="text-small text-ink2">
          Save a template in{" "}
          <a className="underline" href="/templates">
            Templates
          </a>{" "}
          before creating a schedule.
        </p>
      ) : null}
      {templates.error ? <p role="alert">{templates.error.message}</p> : null}
      {schedules.error ? (
        <p role="alert" className="text-red">
          {schedules.error.message}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-red">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="text-lamp-run">
          {notice}
        </p>
      ) : null}
      {schedules.data && liveSchedules.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            {deletedSchedules.length === 0
              ? "No schedules yet. Your first one can be a one-off run or a recurring series."
              : "No active schedules. Create one above or review deleted history below."}
          </p>
        </RailGroup>
      ) : null}
      <section className="space-y-3" aria-label="Saved schedules">
        {liveSchedules.map((schedule) => (
          <ScheduleCard
            key={schedule.id}
            schedule={schedule}
            pending={mutation.isPending || formBusy || editing !== null}
            onAction={act}
            error={error}
            onEdit={() => {
              setEditing(schedule);
              setError(null);
              window.scrollTo?.({ top: 0 });
            }}
          />
        ))}
      </section>
      {deletedSchedules.length > 0 ? (
        <details className="rounded-panel border border-line bg-panel p-4">
          <summary className="cursor-pointer font-semibold">
            Deleted schedule history · {deletedSchedules.length}
          </summary>
          <p className="mt-2 text-small text-ink2">
            Deleted schedules cannot run again. Their occurrence history remains available here.
          </p>
          <section className="mt-4 space-y-3" aria-label="Deleted schedules">
            {deletedSchedules.map((schedule) => (
              <ScheduleCard
                key={schedule.id}
                schedule={schedule}
                pending={false}
                onAction={act}
                error={null}
                onEdit={() => undefined}
              />
            ))}
          </section>
        </details>
      ) : null}
    </div>
  );
}

function ScheduleCard({
  schedule,
  pending,
  onAction,
  onEdit,
  error,
}: {
  readonly schedule: ScheduleSummary;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly error: string | null;
  readonly onAction: (
    job: () => Promise<{ readonly ok: true } | { readonly ok: false; readonly message: string }>,
  ) => void;
}): ReactElement {
  const { api } = useApp();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState<"cancel" | "delete" | null>(null);
  const details = useQuery({
    queryKey: ["schedule", schedule.id],
    queryFn: async () => {
      const reply = await readSchedule(api, schedule.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    enabled: open,
    refetchInterval: 30_000,
  });
  const cadence =
    schedule.cadence.kind === "once"
      ? "One time"
      : schedule.cadence.kind === "daily"
        ? `Daily at ${schedule.cadence.time}`
        : `Weekly at ${schedule.cadence.time}`;
  return (
    <article className="rounded-panel border border-line bg-panel p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="break-words font-semibold">{schedule.name}</h2>
          <p className="text-small text-ink2">
            {cadence} · {schedule.timezone} · {schedule.items.length} variant
            {schedule.items.length === 1 ? "" : "s"}
          </p>
          <p className="mt-1 text-small text-ink3">
            {schedule.deletedAt !== null
              ? `Deleted: ${formatScheduleDate(schedule.deletedAt, schedule.timezone)}`
              : schedule.nextRunAt === null
                ? "No future run"
                : `Next: ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}`}{" "}
            · <span className="capitalize">{schedule.status}</span>
          </p>
          <p className="text-small text-ink2">
            Missed runs: {schedule.missedPolicy === "skip" ? "skip" : "run once on reopening"}.
            Overlap: skip. Spend ceiling:{" "}
            {schedule.spendLimitCents === null ? "not set" : `${schedule.spendLimitCents} cents`}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {schedule.deletedAt === null &&
          (schedule.status === "active" || schedule.status === "paused") ? (
            <Button type="button" disabled={pending} onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          {schedule.deletedAt === null && schedule.status === "active" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
              }
            >
              <PauseIcon aria-hidden="true" className="size-4" />
              Pause
            </Button>
          ) : null}
          {schedule.deletedAt === null && schedule.status === "paused" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                onAction(() => scheduleAction(api, schedule.id, "resume", schedule.version))
              }
            >
              <PlayIcon aria-hidden="true" className="size-4" />
              Resume
            </Button>
          ) : null}
          {schedule.deletedAt === null &&
          (schedule.status === "active" || schedule.status === "paused") ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirm("cancel")}
            >
              <XIcon aria-hidden="true" className="size-4" />
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
          >
            {open ? (
              <ChevronUpIcon aria-hidden="true" className="size-4" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-4" />
            )}
            History
          </Button>
          {schedule.deletedAt === null &&
          (schedule.status === "canceled" || schedule.status === "completed") ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => setConfirm("delete")}
            >
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        title={confirm === "delete" ? "Delete schedule?" : "Cancel schedule?"}
        consequence={
          (confirm === "delete"
            ? "Removes this schedule from the active list. Its run history is kept."
            : "Stops future scheduled runs. Existing projects and run history are kept.") +
          (error ? ` ${error}` : "")
        }
        verb={confirm === "delete" ? "Delete schedule" : "Cancel schedule"}
        dismiss="Keep schedule"
        pending={pending}
        onCancel={() => {
          if (!pending) setConfirm(null);
        }}
        onConfirm={() => {
          const choice = confirm;
          if (!choice) return;
          onAction(async () => {
            const reply =
              choice === "delete"
                ? await deleteSchedule(api, schedule.id, schedule.version)
                : await scheduleAction(api, schedule.id, "cancel", schedule.version);
            if (reply.ok) setConfirm(null);
            return reply;
          });
        }}
      />
      {open ? (
        <div className="mt-4 border-t border-line pt-3">
          {details.isPending ? (
            <p className="text-small text-ink3">Loading history…</p>
          ) : details.error ? (
            <p className="text-small text-red">{details.error.message}</p>
          ) : details.data?.runs.length === 0 ? (
            <p className="text-small text-ink3">No runs yet.</p>
          ) : (
            <ul className="space-y-2">
              {details.data?.runs.map((run) => (
                <li key={run.id} className="flex flex-wrap justify-between gap-2 text-small">
                  <span className="capitalize">
                    {run.status} · {formatScheduleDate(run.scheduledFor, schedule.timezone)}
                  </span>
                  {run.error ? (
                    <span className="text-ink3">{run.error}</span>
                  ) : run.projectIds.length > 0 ? (
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-ink3">
                      {run.projectIds.map((projectId, index) => (
                        <Link
                          key={projectId}
                          className="underline hover:text-ink"
                          to="/projects/$projectId"
                          params={{ projectId }}
                        >
                          Project {index + 1}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <span className="text-ink3">No projects</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </article>
  );
}
