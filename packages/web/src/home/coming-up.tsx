import type { CalendarRun } from "@app/slices/schedules/schema.js";
import type { ReactElement } from "react";
import { runTitle } from "@/calendar/plan";
import { List, ListRow } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { zonedFormat, zonedTime } from "@/lib/zoned";

// Home's "Coming up": the scheduled runs of the next seven days, the title each will make and
// its schedule. Reordering lives on the calendar. A run whose template has no version approved
// for schedules is skipped, and its row says so and where to approve one, in words.

// On the schedule's own clock, its zone named when it isn't this browser's.
const when = { weekday: "short", day: "numeric", month: "short" } as const;

export function ComingUp({ runs }: { readonly runs: readonly CalendarRun[] }): ReactElement {
  return (
    <List label="Coming up">
      {runs.map((run) => (
        <ListRow
          key={`${run.scheduleId}-${run.at}`}
          title={`${zonedFormat(run.at, run.timezone, when)} · ${zonedTime(run.at, run.timezone)} · ${runTitle(run)}`}
          meta={[
            run.scheduleName,
            run.templateName,
            !run.paused && run.notReady ? "To run it, approve a version in Edit template" : null,
          ]
            .filter((part) => part !== null)
            .join(" · ")}
          // A state, so its lamp with its word, as every list says states.
          actions={
            run.paused ? (
              <Status tone="waiting">Paused</Status>
            ) : run.notReady ? (
              <Status tone="waiting">Skipped until approved</Status>
            ) : run.topicSource === "held" ? (
              <Status tone="info">Needs a topic</Status>
            ) : (
              <Status tone="off">Queued</Status>
            )
          }
        />
      ))}
    </List>
  );
}
