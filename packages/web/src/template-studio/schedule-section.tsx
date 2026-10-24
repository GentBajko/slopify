import type { StudioView } from "@app/slices/template-studio/schema.js";
import { useNavigate } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { Button } from "@/components/kit/button";
import { TextLink } from "@/components/kit/link";
import { DataTable } from "@/components/kit/stats";
import { usd } from "@/lib/format";
import { intents, requestIntent } from "@/lib/intents";

// The Schedule section: a new schedule with this template, the runs coming up with the titles
// their topics fill, and what the schedules cost a month. When and how often each runs is set
// on its schedule, in the calendar.
export function ScheduleSection({ view }: { readonly view: StudioView }): ReactElement {
  const navigate = useNavigate();
  const { runs, cost } = view.schedule;
  const when = new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            requestIntent(intents.newSchedule, view.template.id);
            void navigate({ to: "/calendar", search: { tab: "schedules" } });
          }}
        >
          New schedule with this template
        </Button>
        <TextLink to="/calendar" search={{ tab: "schedules" }} className="text-small">
          Schedules in the calendar
        </TextLink>
      </div>
      {runs.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          No schedule runs this template yet. A schedule makes a video from it on the days and at
          the times you pick, each about the next topic in its queue.
        </p>
      ) : (
        <DataTable
          caption="The next runs"
          rowKey={(run) => `${run.scheduleId}:${run.at}`}
          rows={runs}
          empty="No run is coming up."
          columns={[
            { id: "when", header: "When", cell: (run) => when.format(new Date(run.at)) },
            {
              id: "title",
              header: "Title",
              cell: (run) => (run.topic ? run.title : `${run.title} (no topic queued yet)`),
            },
            {
              id: "schedule",
              header: "Schedule",
              cell: (run) => (run.paused ? `${run.scheduleName} (paused)` : run.scheduleName),
            },
          ]}
        />
      )}
      {cost === null || cost.problem !== null ? null : (
        <p className="m-0 text-small text-ink-2">{costWords(cost)}</p>
      )}
    </div>
  );
}

// What the schedules cost a month: the active ones now, and the paused ones once resumed (a
// paused schedule still uses the template, and the calendar lists its runs).
export function costWords(cost: NonNullable<StudioView["schedule"]["cost"]>): string {
  const active = `About ${usd(cost.high)} a month at most, for about ${String(cost.runs)} runs.`;
  const { paused } = cost;
  if (paused.schedules === 0) return active;
  const resumed = `about ${usd(paused.high)} a month at most, for about ${String(paused.runs)} runs`;
  if (cost.runs === 0)
    return paused.schedules === 1
      ? `1 paused schedule uses this template: nothing runs while it is paused. Resumed, ${resumed}.`
      : `${String(paused.schedules)} paused schedules use this template: nothing runs while they are paused. Resumed, ${resumed}.`;
  return `${active} ${paused.schedules === 1 ? "1 paused schedule" : `${String(paused.schedules)} paused schedules`} would add ${resumed}, once resumed.`;
}
