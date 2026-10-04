import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ListRow } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { scheduleStatusLook } from "@/lib/state-words";
import { scheduleAction } from "./api";
import { formatScheduleDate } from "./time";

export type Reply = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type Act = (job: () => Promise<Reply>) => void;

function cadenceOf(schedule: ScheduleSummary): string {
  return schedule.cadence.kind === "once"
    ? "One time"
    : schedule.cadence.kind === "daily"
      ? `Daily at ${schedule.cadence.time}`
      : `Weekly at ${schedule.cadence.time}`;
}

export function ScheduleStatus({ schedule }: { readonly schedule: ScheduleSummary }): ReactElement {
  return schedule.deletedAt !== null ? (
    <Status tone="off">Deleted</Status>
  ) : (
    <Status tone={scheduleStatusLook[schedule.status].tone}>
      {scheduleStatusLook[schedule.status].word}
    </Status>
  );
}

export function ScheduleRow({
  schedule,
  nextTitle,
  selected,
  pending,
  onSelect,
  onEdit,
  onAction,
  onConfirm,
}: {
  readonly schedule: ScheduleSummary;
  // The project title of the next run, when the calendar knows it.
  readonly nextTitle: string | undefined;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly onSelect: () => void;
  readonly onEdit: () => void;
  readonly onAction: Act;
  readonly onConfirm: (kind: "cancel" | "delete") => void;
}): ReactElement {
  const { api } = useApp();
  const live = schedule.deletedAt === null;
  const editable = live && (schedule.status === "active" || schedule.status === "paused");
  const deletable = schedule.status === "canceled" || schedule.status === "completed";
  return (
    <ListRow
      selected={selected}
      onSelect={onSelect}
      title={schedule.name}
      meta={
        <>
          <ScheduleStatus schedule={schedule} />
          {` · ${cadenceOf(schedule)} · ${
            schedule.deletedAt !== null
              ? `Deleted: ${formatScheduleDate(schedule.deletedAt, schedule.timezone)}`
              : schedule.nextRunAt === null
                ? "No future run"
                : `Next: ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}${
                    nextTitle === undefined ? "" : ` · “${nextTitle}”`
                  }`
          }${schedule.topics.held > 0 ? ` · ${String(schedule.topics.held)} waiting for you` : ""}`}
        </>
      }
      actions={
        live ? (
          <>
            <Button
              variant="quiet"
              size="small"
              aria-label={`Edit ${schedule.name}`}
              disabled={pending || !editable}
              disabledReason={
                editable
                  ? "Finish or cancel the open form first"
                  : "Only a live schedule can change"
              }
              onClick={onEdit}
            >
              Edit
            </Button>
            {schedule.status === "paused" ? (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Resume ${schedule.name}`}
                disabled={pending}
                onClick={() =>
                  onAction(() => scheduleAction(api, schedule.id, "resume", schedule.version))
                }
              >
                Resume
              </Button>
            ) : (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Pause ${schedule.name}`}
                disabled={pending || schedule.status !== "active"}
                disabledReason="Only an active schedule can pause"
                onClick={() =>
                  onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
                }
              >
                Pause
              </Button>
            )}
            <Button
              variant="quiet"
              size="small"
              aria-label={`Delete ${schedule.name}`}
              disabled={pending || !deletable}
              disabledReason="Cancel the schedule first; a completed or canceled one can be deleted"
              onClick={() => onConfirm("delete")}
            >
              Delete
            </Button>
          </>
        ) : undefined
      }
    />
  );
}
