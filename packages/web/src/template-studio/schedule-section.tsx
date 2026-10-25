import type { StudioView } from "@app/slices/template-studio/schema.js";
import type { ReactElement } from "react";
import { TextLink } from "@/components/kit/link";
import { DataTable } from "@/components/kit/stats";
import { usd } from "@/lib/format";

type Cost = NonNullable<StudioView["schedule"]["cost"]>;

// The Schedule section: the runs coming up with the titles their topics fill, and what the
// schedules cost a month, naming each step no price is known for. A new schedule with this
// template is the header's New schedule; when and how often each runs is set on its schedule,
// in the calendar.
export function ScheduleSection({ view }: { readonly view: StudioView }): ReactElement {
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
      {runs.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          No schedule runs this template yet. A schedule makes a video from it on the days and at
          the times you pick, each about the next topic in its queue. New schedule, above, starts
          one with this template.
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
              cell: (run) => (run.topic ? run.title : "No topic queued yet"),
            },
            {
              id: "schedule",
              header: "Schedule",
              cell: (run) => (run.paused ? `${run.scheduleName} (paused)` : run.scheduleName),
            },
          ]}
        />
      )}
      {cost === null ? null : (
        <p
          className={
            cost.problem === null ? "m-0 text-small text-ink-2" : "m-0 text-small text-danger"
          }
        >
          {cost.problem ?? costWords(cost)}
        </p>
      )}
      <TextLink to="/calendar" search={{ tab: "schedules" }} className="self-start text-small">
        Schedules in the calendar
      </TextLink>
    </div>
  );
}

// "about 30 runs": a month's runs are an average, said whole.
const runsWord = (runs: number): string => {
  const whole = Math.round(runs);
  return whole === 0
    ? "less than one run"
    : `about ${String(whole)} ${whole === 1 ? "run" : "runs"}`;
};

// What the schedules cost a month: the active ones now, and the paused ones once resumed (a
// paused schedule still uses the template, and the calendar lists its runs). A step with no
// price is named and left out, so the figure is the least it costs.
function costWords(cost: Cost): string {
  const unpriced =
    cost.unknown === 0
      ? ""
      : cost.unpriced.length === 0
        ? ` ${String(cost.unknown)} ${cost.unknown === 1 ? "step has" : "steps have"} no known price and ${cost.unknown === 1 ? "isn't" : "aren't"} counted.`
        : ` Not counted, with no known price: ${listOf(cost.unpriced)}.`;
  // "About $4.35 a month at most", or with steps left out, "At least $6.08 a month".
  const sum = (high: number) =>
    cost.unknown === 0 ? `about ${usd(high)} a month at most` : `at least ${usd(high)} a month`;
  const active = `${capital(sum(cost.high))}, for ${runsWord(cost.runs)}.`;
  const { paused } = cost;
  if (paused.schedules === 0) return `${active}${unpriced}`;
  const resumed = `${sum(paused.high)}, for ${runsWord(paused.runs)}`;
  if (cost.runs === 0)
    return `${
      paused.schedules === 1
        ? `1 paused schedule uses this template: nothing runs while it is paused. Resumed, ${resumed}.`
        : `${String(paused.schedules)} paused schedules use this template: nothing runs while they are paused. Resumed, ${resumed}.`
    }${unpriced}`;
  return `${active} ${paused.schedules === 1 ? "1 paused schedule" : `${String(paused.schedules)} paused schedules`} would add ${resumed}, once resumed.${unpriced}`;
}

const capital = (text: string): string => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

function listOf(names: readonly string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1) ?? ""}`;
}
