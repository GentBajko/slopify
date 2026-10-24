import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { PlusIcon } from "lucide-react";
import { Fragment, type ReactElement, type ReactNode } from "react";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { List } from "@/components/kit/list-row";
import { RetiredModelRow } from "@/components/retired-models";
import { type Act, ScheduleRow } from "./schedule-row";

// The Schedules tab's list column: search and sort when there are several, the live schedules
// with their row actions, and the deleted ones folded away below.
export function ScheduleList({
  tools,
  loaded,
  live,
  hiddenBySearch,
  channelFiltered,
  deleted,
  selectedId,
  pending,
  nextTitles,
  onPick,
  onEdit,
  onAction,
  onConfirm,
  onNew,
}: {
  readonly tools: ReactNode;
  readonly loaded: boolean;
  readonly live: readonly ScheduleSummary[];
  // How many of the channel's schedules the search hides.
  readonly hiddenBySearch: number;
  readonly channelFiltered: boolean;
  readonly deleted: readonly ScheduleSummary[];
  readonly selectedId: string | undefined;
  readonly pending: boolean;
  readonly nextTitles: ReadonlyMap<string, string>;
  readonly onPick: (scheduleId: string) => void;
  readonly onEdit: (schedule: ScheduleSummary) => void;
  readonly onAction: Act;
  readonly onConfirm: (kind: "cancel" | "delete", schedule: ScheduleSummary) => void;
  // New schedule, inside the empty list; absent while one cannot be made.
  readonly onNew?: (() => void) | undefined;
}): ReactElement {
  return (
    <>
      {tools}
      {live.length === 0 && hiddenBySearch > 0 ? (
        <EmptyState title="No schedule matches this search">
          {`Check the spelling, or clear the search to see all ${String(hiddenBySearch)}.`}
        </EmptyState>
      ) : loaded && live.length === 0 ? (
        <EmptyState
          title={
            channelFiltered
              ? "No schedules run this channel's templates"
              : deleted.length === 0
                ? "No schedules yet"
                : "No active schedules"
          }
          {...(onNew === undefined
            ? {}
            : {
                actions: (
                  <Button variant="primary" onClick={onNew}>
                    <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    New schedule
                  </Button>
                ),
              })}
        >
          {channelFiltered
            ? "Pick All channels to see the others, or make one from this channel's templates."
            : deleted.length === 0
              ? "Pick a template, the days and a time; each run then makes a new video by itself while Slopify is open."
              : "Make a new one, or look through the deleted ones below."}
        </EmptyState>
      ) : null}
      {live.length > 0 ? (
        <List label="Saved schedules" className="sl-list--wrap-actions">
          {live.map((schedule) => (
            <Fragment key={schedule.id}>
              <ScheduleRow
                schedule={schedule}
                nextTitle={nextTitles.get(schedule.id)}
                selected={selectedId === schedule.id}
                pending={pending}
                onSelect={() => onPick(schedule.id)}
                onEdit={() => onEdit(schedule)}
                onAction={onAction}
                onConfirm={(kind) => onConfirm(kind, schedule)}
              />
              <RetiredModelRow kind="schedule" id={schedule.id} name={schedule.name} />
            </Fragment>
          ))}
        </List>
      ) : null}
      {deleted.length > 0 ? (
        <details className="mt-6">
          <summary className="cursor-pointer text-small font-semibold text-ink-2">
            Deleted schedules · {deleted.length}
          </summary>
          <p className="m-0 mt-2 mb-2 text-small text-ink-2">
            Deleted schedules stay in Settings → Trash for 30 days, where Restore brings one back
            paused. Pick one to see its run history.
          </p>
          <List label="Deleted schedules">
            {deleted.map((schedule) => (
              <ScheduleRow
                key={schedule.id}
                schedule={schedule}
                nextTitle={undefined}
                selected={selectedId === schedule.id}
                pending={false}
                onSelect={() => onPick(schedule.id)}
                onEdit={() => undefined}
                onAction={onAction}
                onConfirm={() => undefined}
              />
            ))}
          </List>
        </details>
      ) : null}
    </>
  );
}
