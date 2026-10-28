import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { ButtonLink } from "@/components/kit/link";
import { ListRow } from "@/components/kit/list-row";
import { Badge, Status } from "@/components/kit/status";
import { scheduleStatusLook } from "@/lib/state-words";
import { scheduleAction } from "./api";
import { formatScheduleDate } from "./time";

export type Reply = { readonly ok: true } | { readonly ok: false; readonly message: string };
export type Act = (job: () => Promise<Reply>) => void;

// Monday first, as the form's Weekdays read.
const weekdayNames: readonly (readonly [number, string])[] = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];

// "Mon, Wed, Fri at 09:00": a weekly schedule names its days, and all seven read Every day.
export function weekdaysAt(days: readonly number[], time: string): string {
  const named = weekdayNames.filter(([day]) => days.includes(day)).map(([, name]) => name);
  return named.length === 7 ? `Every day at ${time}` : `${named.join(", ")} at ${time}`;
}

function cadenceOf(schedule: ScheduleSummary): string {
  if (schedule.cadence.kind === "by-date") return `Ahead of each date at ${schedule.cadence.time}`;
  return schedule.cadence.kind === "once"
    ? "One time"
    : schedule.cadence.kind === "daily"
      ? `Daily at ${schedule.cadence.time}`
      : weekdaysAt(schedule.cadence.days, schedule.cadence.time);
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
          {schedule.templateKind === "design" ? (
            <>
              {" "}
              <Badge tone="info">Designed piece</Badge>
            </>
          ) : null}
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
            {schedule.templateKind === "design" ? (
              // A design schedule's rows and dates are kept with its design template.
              <ButtonLink
                variant="quiet"
                size="small"
                to="/design-templates/$templateId"
                params={{ templateId: schedule.templateId }}
                hash="schedule"
                aria-label={`Edit ${schedule.name}`}
              >
                Edit
              </ButtonLink>
            ) : // A completed or canceled schedule cannot change: no Edit drawn greyed.
            editable ? (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Edit ${schedule.name}`}
                disabled={pending}
                disabledReason="Finish or cancel the open form first"
                onClick={onEdit}
              >
                Edit
              </Button>
            ) : null}
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
            ) : schedule.status === "active" ? (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Pause ${schedule.name}`}
                disabled={pending}
                onClick={() =>
                  onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
                }
              >
                Pause
              </Button>
            ) : null}
            {/* Only a completed or canceled schedule can be deleted (Cancel schedule is in its
                detail): offered then, not drawn greyed before. */}
            {deletable ? (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Delete ${schedule.name}`}
                disabled={pending}
                onClick={() => onConfirm("delete")}
              >
                Delete
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    />
  );
}
