import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { Rule } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { readSchedule, scheduleAction } from "./api";
import { TopicGenerationPanel } from "./held-topics";
import { InlineTopics } from "./inline-topics";
import { type Act, ScheduleStatus } from "./schedule-row";
import { formatScheduleDate } from "./time";

// The picked schedule: its policy, topic generation and run history, with Cancel for a live
// one (rare, so here rather than on every row).
export function ScheduleDetail({
  schedule,
  pending,
  onAction,
  onConfirm,
  onDuplicate,
}: {
  readonly schedule: ScheduleSummary;
  readonly pending: boolean;
  readonly onAction: Act;
  readonly onConfirm: (kind: "cancel" | "delete") => void;
  // A paused copy of its settings, without its topics.
  readonly onDuplicate: () => void;
}): ReactElement {
  const { api } = useApp();
  const details = useQuery({
    queryKey: ["schedule", schedule.id],
    queryFn: async () => {
      const reply = await readSchedule(api, schedule.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    refetchInterval: 30_000,
  });
  const live = schedule.deletedAt === null;
  const editable = live && (schedule.status === "active" || schedule.status === "paused");
  const paused = schedule.status === "paused";
  const facts: readonly (readonly [string, string])[] = [
    [
      "When",
      schedule.cadence.kind === "once"
        ? `Once, ${formatScheduleDate(schedule.cadence.at, schedule.timezone)}`
        : schedule.cadence.kind === "daily"
          ? `Every day at ${schedule.cadence.time}`
          : `Selected weekdays at ${schedule.cadence.time}`,
    ],
    ["Timezone", schedule.timezone],
    [
      "Next run",
      schedule.deletedAt !== null || schedule.nextRunAt === null
        ? "None"
        : formatScheduleDate(schedule.nextRunAt, schedule.timezone),
    ],
    [
      "Topics",
      schedule.items.length === 0
        ? schedule.topicGeneration.mode === "off"
          ? "Template as saved"
          : "No topics queued"
        : `${String(schedule.items.length)} ${schedule.items.length === 1 ? "topic" : "topics"} left`,
    ],
    ["Missed runs", schedule.missedPolicy === "skip" ? "Skip" : "Run once on reopening"],
    ["Overlap", "Skip"],
    [
      "Spend ceiling",
      schedule.spendLimitCents === null ? "Not set" : `${String(schedule.spendLimitCents)} cents`,
    ],
  ];
  return (
    <section aria-label={`${schedule.name} detail`}>
      {live && editable ? (
        <PauseCommand schedule={schedule} paused={paused} onAction={onAction} />
      ) : null}
      <SectionHead
        kicker={<ScheduleStatus schedule={schedule} />}
        title={schedule.name}
        meta={
          schedule.topics.held > 0
            ? `${String(schedule.topics.held)} topics waiting for you`
            : undefined
        }
      >
        {live ? (
          <Button
            variant="quiet"
            size="small"
            aria-label={`Duplicate ${schedule.name}`}
            disabled={pending}
            disabledReason="Finish or cancel the open change first"
            onClick={onDuplicate}
          >
            Duplicate
          </Button>
        ) : null}
        {live ? (
          <Button
            variant="quiet"
            size="small"
            aria-label={`Cancel ${schedule.name}`}
            disabled={pending || !editable}
            disabledReason="Only an active or paused schedule can be canceled"
            onClick={() => onConfirm("cancel")}
          >
            Cancel schedule
          </Button>
        ) : null}
      </SectionHead>
      <dl className="m-0 mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-small min-[600px]:grid-cols-2">
        {facts.map(([term, value]) => (
          <div key={term} className="min-w-0">
            <dt className="sl-kicker">{term}</dt>
            <dd className="m-0 break-words text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {editable ? <InlineTopics schedule={schedule} /> : null}
      <TopicGenerationPanel schedule={schedule} />
      <Rule className="my-6" />
      <SectionHead as="h3" title="Run history" />
      <div className="mt-3">
        {details.isPending ? (
          <p className="m-0 text-small text-ink-3">Loading history…</p>
        ) : details.error ? (
          <p className="m-0 text-small text-danger">
            {`The run history couldn't be loaded: ${details.error.message} It tries again every 30 seconds.`}
          </p>
        ) : details.data.runs.length === 0 ? (
          <p className="m-0 text-small text-ink-3">No runs yet.</p>
        ) : (
          <List label={`Runs of ${schedule.name}`}>
            {details.data.runs.map((run) => (
              <ListRow
                key={run.id}
                title={
                  <span className="capitalize">
                    {`${run.status} · ${formatScheduleDate(run.scheduledFor, schedule.timezone)}`}
                  </span>
                }
                meta={
                  run.error ? (
                    run.error
                  ) : run.projectIds.length > 0 ? (
                    <span className="inline-flex flex-wrap gap-x-3">
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
                    "No projects"
                  )
                }
              />
            ))}
          </List>
        )}
      </div>
    </section>
  );
}

// Ctrl+K: pause or resume the schedule in the detail.
function PauseCommand({
  schedule,
  paused,
  onAction,
}: {
  readonly schedule: ScheduleSummary;
  readonly paused: boolean;
  readonly onAction: Act;
}): null {
  const { api } = useApp();
  useCommand({
    id: "schedules.pause-resume",
    title: paused ? "Resume schedule" : "Pause schedule",
    group: "Schedules",
    context: schedule.name,
    run: () =>
      onAction(() =>
        scheduleAction(api, schedule.id, paused ? "resume" : "pause", schedule.version),
      ),
  });
  return null;
}
