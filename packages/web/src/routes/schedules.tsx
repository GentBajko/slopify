import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDownIcon, ChevronUpIcon, EllipsisIcon, PlusIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { ConfirmDialog } from "@/components/confirm";
import { StatusSlot } from "@/components/kit/action-bar";
import { Drawer } from "@/components/kit/drawer";
import { InfoTip } from "@/components/kit/info-tip";
import { useToast } from "@/components/kit/toast";
import { Lamp } from "@/components/lamp";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { LibraryToolbar } from "./library.js";

export function SchedulesRoute(): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const [editing, setEditing] = useState<ScheduleSummary | null>(null);
  const [creating, setCreating] = useState(false);
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
    setError(null);
    mutation.mutate(job);
  };

  const formOpen = creating || editing !== null;
  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setError(null);
  };
  const status = error
    ? ({ tone: "error", text: error } as const)
    : schedules.error
      ? ({ tone: "error", text: schedules.error.message } as const)
      : templates.error
        ? ({ tone: "error", text: templates.error.message } as const)
        : undefined;
  return (
    <div>
      <LibraryToolbar
        action={
          <Button
            type="button"
            onClick={() => {
              setEditing(null);
              setCreating(true);
              setError(null);
            }}
            disabled={formOpen || templates.data?.length === 0}
          >
            <PlusIcon aria-hidden="true" className="size-[14px]" />
            New schedule
          </Button>
        }
      >
        <p className="flex items-center gap-1 text-small text-ink2">
          {templates.data?.length === 0 ? (
            <>
              Save a template in{" "}
              <Link className="underline" to="/templates">
                Templates
              </Link>{" "}
              before creating a schedule.
            </>
          ) : (
            "Runs a saved template on this machine at a local time."
          )}
          <InfoTip label="Schedules">
            <p>
              Each schedule keeps a durable history and creates fresh projects, so changing a
              template never rewrites an old run. Schedules use the selected template version and
              never include uploaded media.
            </p>
          </InfoTip>
        </p>
      </LibraryToolbar>
      <StatusSlot tone={formOpen ? "info" : (status?.tone ?? "info")} className="mb-2">
        {formOpen ? undefined : status?.text}
      </StatusSlot>
      {schedules.data && liveSchedules.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            {deletedSchedules.length === 0
              ? "No schedules yet. Your first one can be a one-off run or a recurring series."
              : "No active schedules. Create one or review deleted history below."}
          </p>
        </RailGroup>
      ) : null}
      {liveSchedules.length > 0 ? (
        <section
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Saved schedules"
        >
          {liveSchedules.map((schedule) => (
            <ScheduleCard
              key={schedule.id}
              schedule={schedule}
              pending={mutation.isPending || formBusy || formOpen}
              onAction={act}
              error={error}
              onEdit={() => {
                setCreating(false);
                setEditing(schedule);
                setError(null);
              }}
            />
          ))}
        </section>
      ) : null}
      {deletedSchedules.length > 0 ? (
        <details className="mt-4">
          <summary className="cursor-pointer text-small font-semibold text-ink2">
            Deleted schedules · {deletedSchedules.length}
          </summary>
          <p className="mt-2 text-small text-ink2">
            Deleted schedules cannot run again. Their occurrence history remains available here.
          </p>
          <section
            className="mt-2 overflow-hidden rounded-panel border border-line bg-panel"
            aria-label="Deleted schedules"
          >
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
      <Drawer
        open={formOpen}
        title={editing ? "Edit schedule" : "New schedule"}
        onClose={() => {
          if (!formBusy) closeForm();
        }}
      >
        <ScheduleForm
          onBusy={setFormBusy}
          key={editing?.id ?? "new"}
          editing={editing}
          onCancel={closeForm}
          templates={templates.data ?? []}
          pending={mutation.isPending}
          error={error}
          onCreated={() => {
            notify(
              editing
                ? "Schedule updated."
                : "Schedule saved. It will run automatically while Slopify is open.",
              "success",
            );
            closeForm();
            void queryClient.invalidateQueries({ queryKey: schedulesKey });
          }}
          onError={(message) => {
            setError(message);
            void queryClient.invalidateQueries({ queryKey: schedulesKey });
          }}
        />
      </Drawer>
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
  const live = schedule.deletedAt === null;
  const editable = live && (schedule.status === "active" || schedule.status === "paused");
  const lamp =
    !live || schedule.status === "canceled"
      ? "canceled"
      : schedule.status === "paused"
        ? "paused"
        : schedule.status === "completed"
          ? "done"
          : "running";
  return (
    <article className="border-b border-line px-4 py-[10px] last:border-b-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Lamp state={lamp} className="animate-none" />
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-semibold">{schedule.name}</h2>
          <p className="text-small text-ink2">
            {cadence} · {schedule.timezone} · {schedule.items.length} variant
            {schedule.items.length === 1 ? "" : "s"} ·{" "}
            {schedule.deletedAt !== null
              ? `Deleted: ${formatScheduleDate(schedule.deletedAt, schedule.timezone)}`
              : schedule.nextRunAt === null
                ? "No future run"
                : `Next: ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}`}
          </p>
        </div>
        <span className="engraved w-[76px] text-ink2 capitalize">{schedule.status}</span>
        <InfoTip label={`${schedule.name} policy`}>
          <p>
            Missed runs: {schedule.missedPolicy === "skip" ? "skip" : "run once on reopening"}.
            Overlap: skip. Spend ceiling:{" "}
            {schedule.spendLimitCents === null ? "not set" : `${schedule.spendLimitCents} cents`}.
          </p>
        </InfoTip>
        <div className="flex items-center gap-1">
          {live ? (
            <Button type="button" disabled={pending || !editable} onClick={onEdit}>
              Edit
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
          {live ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={`More for ${schedule.name}`}
                  className="size-8 p-0"
                >
                  <EllipsisIcon aria-hidden="true" className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                {schedule.status === "paused" ? (
                  <DropdownMenuItem
                    disabled={pending || !live}
                    onSelect={() =>
                      onAction(() => scheduleAction(api, schedule.id, "resume", schedule.version))
                    }
                  >
                    Resume
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    disabled={pending || !live || schedule.status !== "active"}
                    onSelect={() =>
                      onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
                    }
                  >
                    Pause
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  disabled={pending || !editable}
                  onSelect={() => setConfirm("cancel")}
                >
                  Cancel
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={
                    pending ||
                    !live ||
                    (schedule.status !== "canceled" && schedule.status !== "completed")
                  }
                  onSelect={() => setConfirm("delete")}
                >
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
        <div className="mt-3 border-t border-line pt-3 pl-6">
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
