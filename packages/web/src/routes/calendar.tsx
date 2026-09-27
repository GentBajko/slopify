import type { Calendar, CalendarRun } from "@app/slices/schedules/schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { type ReactElement, useMemo, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { InfoTip } from "@/components/kit/info-tip";
import { Lamp } from "@/components/lamp";
import { RailGroup } from "@/components/rail";
import { Button } from "@/components/ui/button";
import {
  calendarKey,
  calendarQuery,
  moveTopic,
  type ScheduleReply,
  schedulesKey,
  schedulesQuery,
  transferTopic,
} from "@/schedules/api";
import { LibraryToolbar } from "./library.js";

const dayMs = 24 * 60 * 60_000;
const weeks = 4;

// The coming four weeks, one day after another: every scheduled run with the topic it will
// use, the projects running or finished, and the batch items still waiting. A queued topic
// moves up or down its schedule's queue, or onto another schedule, from its row.
export function CalendarRoute(): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  // The window starts at local midnight today, fixed for the life of the page.
  const [range] = useState(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return {
      from: start.toISOString(),
      to: new Date(start.valueOf() + weeks * 7 * dayMs).toISOString(),
    };
  });
  const calendar = useQuery(calendarQuery(api, range.from, range.to));
  const schedules = useQuery(schedulesQuery(api));
  const [error, setError] = useState<string | null>(null);
  const action = useMutation({
    mutationFn: (job: () => Promise<ScheduleReply<unknown>>) => job(),
    onSuccess: (reply) => setError(reply.ok ? null : reply.message),
    onError: (cause: Error) => setError(cause.message),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: calendarKey }),
        client.invalidateQueries({ queryKey: schedulesKey }),
      ]);
    },
  });
  const queueLength = useMemo(
    () => new Map((schedules.data ?? []).map((schedule) => [schedule.id, schedule.items.length])),
    [schedules.data],
  );
  const targets = (schedules.data ?? []).filter(
    (schedule) =>
      schedule.deletedAt === null && (schedule.status === "active" || schedule.status === "paused"),
  );
  const days = calendar.data === undefined ? [] : byDay(calendar.data);
  const status = error ?? calendar.error?.message ?? schedules.error?.message;
  return (
    <div>
      <LibraryToolbar>
        <p className="flex items-center gap-1 text-small text-ink2">
          The next {weeks} weeks: scheduled runs, projects and the batch queue.
          <InfoTip label="Calendar">
            <p>
              Each run takes the first topic in its schedule's queue, so moving a topic up or down
              changes which day it runs. Move to puts it at the end of another schedule's queue.
            </p>
          </InfoTip>
        </p>
      </LibraryToolbar>
      <StatusSlot tone={status ? "error" : "info"} className="mb-2">
        {status}
      </StatusSlot>
      {calendar.isPending ? (
        <p className="text-small text-ink3">Loading the calendar…</p>
      ) : calendar.data && days.length === 0 && calendar.data.queued.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            Nothing is planned for the next {weeks} weeks. Create a schedule under{" "}
            <Link className="underline" to="/schedules">
              Schedules
            </Link>
            .
          </p>
        </RailGroup>
      ) : null}
      {days.length > 0 ? (
        <section
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Coming weeks"
        >
          {days.map((day) => (
            <div key={day.key} className="border-b border-line px-4 py-[10px] last:border-b-0">
              <h2 className="mb-2 font-semibold">{day.label}</h2>
              <ul className="space-y-2">
                {day.runs.map((run) => (
                  <RunRow
                    key={`${run.scheduleId}-${run.at}`}
                    run={run}
                    last={(queueLength.get(run.scheduleId) ?? 0) - 1}
                    targets={targets.filter((schedule) => schedule.id !== run.scheduleId)}
                    busy={action.isPending}
                    onMove={(to) =>
                      action.mutate(() =>
                        moveTopic(api, run.scheduleId, {
                          baseVersion: run.scheduleVersion,
                          from: run.index ?? 0,
                          to,
                        }),
                      )
                    }
                    onTransfer={(targetId) =>
                      action.mutate(() =>
                        transferTopic(api, run.scheduleId, {
                          baseVersion: run.scheduleVersion,
                          index: run.index ?? 0,
                          targetId,
                        }),
                      )
                    }
                  />
                ))}
                {day.projects.map((project) => (
                  <li key={project.id} className="flex flex-wrap items-center gap-2 text-small">
                    <Lamp state={project.state} className="animate-none" />
                    <Link
                      className="min-w-0 flex-1 break-words underline hover:text-ink"
                      to="/projects/$projectId"
                      params={{ projectId: project.id }}
                    >
                      {project.title}
                    </Link>
                    <span className="text-ink3 capitalize">{project.state}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
      {calendar.data && calendar.data.queued.length > 0 ? (
        <section className="mt-4" aria-label="Batch queue">
          <h2 className="mb-2 font-semibold">Batch queue · {calendar.data.queued.length}</h2>
          <ol className="overflow-hidden rounded-panel border border-line bg-panel">
            {calendar.data.queued.map((item) => (
              <li
                key={item.projectId}
                className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-[10px] text-small last:border-b-0"
              >
                <Link
                  className="min-w-0 flex-1 break-words underline hover:text-ink"
                  to="/projects/$projectId"
                  params={{ projectId: item.projectId }}
                >
                  {item.title}
                </Link>
                <span className="text-ink3">
                  {item.state === "active" ? "Running now" : "Waiting its turn"}
                </span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

function RunRow({
  run,
  last,
  targets,
  busy,
  onMove,
  onTransfer,
}: {
  readonly run: CalendarRun;
  readonly last: number;
  readonly targets: readonly { readonly id: string; readonly name: string }[];
  readonly busy: boolean;
  readonly onMove: (to: number) => void;
  readonly onTransfer: (targetId: string) => void;
}): ReactElement {
  const time = new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(run.at));
  const topic =
    run.topic ??
    (run.topicSource === "held"
      ? "A topic waiting for your approval"
      : run.topicSource === "generated"
        ? "A topic still to be generated"
        : "The template as saved");
  const index = run.index;
  return (
    <li className="flex flex-wrap items-center gap-2 text-small">
      <span className="w-[64px] shrink-0 tabular-nums text-ink2">{time}</span>
      <span className="min-w-0 flex-1">
        <span className={run.topic === null ? "text-ink3" : "font-semibold"}>{topic}</span>
        <span className="block text-ink3">
          {run.scheduleName}
          {run.templateName === null ? "" : ` · ${run.templateName}`}
          {run.paused ? " · Paused" : ""}
        </span>
      </span>
      {index === null ? null : (
        <span className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            aria-label={`Move ${topic} earlier`}
            disabled={busy || index === 0}
            onClick={() => onMove(index - 1)}
          >
            <ArrowUpIcon aria-hidden="true" className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            aria-label={`Move ${topic} later`}
            disabled={busy || index >= last}
            onClick={() => onMove(index + 1)}
          >
            <ArrowDownIcon aria-hidden="true" className="size-4" />
          </Button>
          {targets.length > 0 ? (
            <select
              aria-label={`Move ${topic} to another schedule`}
              className="h-8 rounded-control border border-line2 bg-panel2 px-2 text-small"
              value=""
              disabled={busy}
              onChange={(event) => {
                if (event.target.value !== "") onTransfer(event.target.value);
              }}
            >
              <option value="">Move to…</option>
              {targets.map((target) => (
                <option key={target.id} value={target.id}>
                  {target.name}
                </option>
              ))}
            </select>
          ) : null}
        </span>
      )}
    </li>
  );
}

interface Day {
  readonly key: string;
  readonly label: string;
  readonly runs: CalendarRun[];
  readonly projects: Calendar["projects"][number][];
}

// Groups by the viewer's own calendar day. A project still going sits on today; a finished
// one on the day it finished.
function byDay(calendar: Calendar): readonly Day[] {
  const days = new Map<string, Day>();
  const dayOf = (iso: string): Day => {
    const date = new Date(iso);
    const key = `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    let day = days.get(key);
    if (day === undefined) {
      day = {
        key,
        label: new Intl.DateTimeFormat(undefined, { dateStyle: "full" }).format(date),
        runs: [],
        projects: [],
      };
      days.set(key, day);
    }
    return day;
  };
  const today = new Date().toISOString();
  // A batch item waiting its turn is listed under the batch queue instead.
  const queued = new Set(calendar.queued.map((item) => item.projectId));
  for (const project of calendar.projects)
    if (!queued.has(project.id)) dayOf(project.finishedAt ?? today).projects.push(project);
  for (const run of calendar.runs) dayOf(run.at).runs.push(run);
  return [...days.values()].sort((a, b) => a.key.localeCompare(b.key));
}
