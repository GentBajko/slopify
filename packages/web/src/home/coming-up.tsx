import type { CalendarRun } from "@app/slices/schedules/schema.js";
import type { ReactElement } from "react";
import { runTitle } from "@/calendar/plan";
import { List, ListRow } from "@/components/kit/list-row";
import { Badge } from "@/components/kit/status";
import { zonedFormat, zonedTime } from "@/lib/zoned";

// Home's "Coming up": the scheduled runs of the next seven days, the title each will make and
// its schedule. Reordering lives on the calendar.

// On the schedule's own clock, its zone named when it isn't this browser's.
const when = { weekday: "short", day: "numeric", month: "short" } as const;

export function ComingUp({ runs }: { readonly runs: readonly CalendarRun[] }): ReactElement {
  return (
    <List label="Coming up">
      {runs.map((run) => (
        <ListRow
          key={`${run.scheduleId}-${run.at}`}
          title={`${zonedFormat(run.at, run.timezone, when)} · ${zonedTime(run.at, run.timezone)} · ${runTitle(run)}`}
          meta={[run.scheduleName, run.templateName].filter((part) => part !== null).join(" · ")}
          actions={
            run.paused ? (
              <Badge tone="waiting">Paused</Badge>
            ) : run.notReady ? (
              <Badge
                tone="waiting"
                title="No version of its template is marked ready, so this run is skipped. Open the template's studio and press Mark ready."
              >
                Waits for Mark ready
              </Badge>
            ) : run.topicSource === "held" ? (
              <Badge tone="info">Needs a topic</Badge>
            ) : (
              <Badge>Queued</Badge>
            )
          }
        />
      ))}
    </List>
  );
}
