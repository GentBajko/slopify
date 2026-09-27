import type { CalendarRun } from "@app/slices/schedules/schema.js";
import type { ReactElement } from "react";
import { runTitle } from "@/calendar/plan";
import { List, ListRow } from "@/components/kit/list-row";
import { Badge } from "@/components/kit/status";

// Home's "Coming up": the scheduled runs of the next seven days, the title each will make and
// its schedule. Reordering lives on the calendar.

const when = new Intl.DateTimeFormat(undefined, {
  weekday: "short",
  day: "numeric",
  month: "short",
});
const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });

export function ComingUp({ runs }: { readonly runs: readonly CalendarRun[] }): ReactElement {
  return (
    <List label="Coming up">
      {runs.map((run) => (
        <ListRow
          key={`${run.scheduleId}-${run.at}`}
          title={`${when.format(new Date(run.at))} · ${time.format(new Date(run.at))} · ${runTitle(run)}`}
          meta={[run.scheduleName, run.templateName].filter((part) => part !== null).join(" · ")}
          actions={
            run.paused ? (
              <Badge tone="waiting">Paused</Badge>
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
