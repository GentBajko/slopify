import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { XIcon } from "lucide-react";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { useCommand } from "@/components/kit/command-palette";
import { InfoTip } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import {
  approveAllHeldTopics,
  approveHeldTopic,
  calendarKey,
  generateTopicsNow,
  heldTopicsKey,
  readHeldTopics,
  rejectHeldTopic,
  type ScheduleReply,
  schedulesKey,
} from "@/schedules/api";
import { heldValuesLine } from "@/schedules/held-topics";
import { TopicFailure } from "@/schedules/topic-failure";

// The calendar's side panel: topics Slopify suggested from a schedule's series brief, held for
// the person to queue or reject. One block per schedule that holds its suggestions.

// The schedules that hold suggested topics; the calendar shows the panel only when one does.
export function suggesting(schedules: readonly ScheduleSummary[]): readonly ScheduleSummary[] {
  return schedules.filter(
    (one) =>
      one.deletedAt === null &&
      one.topicGeneration.mode !== "off" &&
      (one.status === "active" || one.status === "paused"),
  );
}

export function SuggestedTopics({
  schedules,
}: {
  readonly schedules: readonly ScheduleSummary[];
}): ReactElement {
  const holding = suggesting(schedules);
  const live = schedules.filter(
    (one) => one.deletedAt === null && (one.status === "active" || one.status === "paused"),
  );
  return (
    <div className="flex flex-col gap-6">
      {holding.length === 0 ? (
        <>
          <SectionHead title="Suggested topics" />
          <p className="m-0 text-small text-ink-2">
            No schedule suggests its own topics yet. Turn on topic generation in a schedule and its
            suggestions wait here for you.
          </p>
          {/* Straight to the schedule whose series brief and topic generation to set. */}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {live.length === 0 ? (
              <TextLink to="/calendar" search={{ tab: "schedules" }}>
                Open schedules
              </TextLink>
            ) : (
              live.slice(0, 4).map((one) => (
                <TextLink
                  key={one.id}
                  to="/calendar"
                  search={{ tab: "schedules", schedule: one.id }}
                >
                  Open {one.name}
                </TextLink>
              ))
            )}
          </div>
        </>
      ) : (
        holding.map((schedule, index) => (
          <ScheduleSuggestions key={schedule.id} schedule={schedule} first={index === 0} />
        ))
      )}
    </div>
  );
}

function ScheduleSuggestions({
  schedule,
  first,
}: {
  readonly schedule: ScheduleSummary;
  readonly first: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const held = useQuery({
    queryKey: [...heldTopicsKey(schedule.id), schedule.topics.held, schedule.version],
    queryFn: async () => {
      const reply = await readHeldTopics(api, schedule.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
    enabled: schedule.topics.held > 0,
  });
  const act = useMutation({
    mutationFn: (job: () => Promise<ScheduleReply<unknown>>) => job(),
    onSuccess: (reply) => {
      if (!reply.ok) notify(reply.message, "error");
    },
    onError: (error: Error) =>
      notify(`The topics weren't changed: ${error.message} Try again in a moment.`, "error"),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: schedulesKey }),
        client.invalidateQueries({ queryKey: calendarKey }),
        client.invalidateQueries({ queryKey: heldTopicsKey(schedule.id) }),
      ]);
    },
  });
  const topics = schedule.topics.held > 0 ? (held.data ?? []) : [];
  const approveAll = () => act.mutate(() => approveAllHeldTopics(api, schedule.id));
  useCommand({
    id: `calendar.approve-all.${schedule.id}`,
    title: "Queue all suggested topics",
    group: "Calendar",
    context: schedule.name,
    keywords: ["approve", "suggestions", "topics"],
    run: approveAll,
  });
  const generating = schedule.topics.generatingSince !== null;
  const hold = schedule.topicGeneration.mode === "hold";
  return (
    <section aria-label={`Suggested topics for ${schedule.name}`} className="flex flex-col gap-3">
      <SectionHead
        title={first ? "Suggested topics" : schedule.name}
        kicker={first ? schedule.name : undefined}
        meta="From the series brief · not made or queued before"
        info="planning.schedule.held"
      >
        {topics.length > 0 ? (
          <Button size="small" variant="secondary" disabled={act.isPending} onClick={approveAll}>
            {`Queue all ${String(topics.length)}`}
          </Button>
        ) : (
          <>
            <InfoTip id="planning.schedule.generate-now" label="Suggest topics now" />
            <Button
              size="small"
              variant="quiet"
              disabled={act.isPending || generating}
              disabledReason={generating ? "Slopify is suggesting topics now." : "Working…"}
              onClick={() => act.mutate(() => generateTopicsNow(api, schedule.id))}
            >
              {generating ? "Suggesting…" : "Suggest topics now"}
            </Button>
          </>
        )}
      </SectionHead>
      <TopicFailure
        schedule={schedule}
        title="The last suggestion failed."
        retry={{
          run: () => act.mutate(() => generateTopicsNow(api, schedule.id)),
          busy: act.isPending || generating,
        }}
      />
      {held.error === null ? null : (
        <p className="m-0 text-small text-danger">
          {`The suggestions didn't load: ${held.error.message} Reload the page to try again.`}
        </p>
      )}
      {topics.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          {generating
            ? "Slopify is asking for new topics. They appear here when it finishes."
            : "No suggestions are waiting."}
        </p>
      ) : (
        <List label={`Suggestions for ${schedule.name}`}>
          {topics.map((topic) => (
            <ListRow
              key={topic.id}
              title={topic.title}
              meta={heldValuesLine(topic.values)}
              actions={
                <>
                  <Button
                    size="small"
                    variant="quiet"
                    disabled={act.isPending}
                    onClick={() => act.mutate(() => approveHeldTopic(api, schedule.id, topic.id))}
                    aria-label={`Queue ${topic.title}`}
                  >
                    Queue
                  </Button>
                  <IconButton
                    size="small"
                    label={`Reject ${topic.title}`}
                    disabled={act.isPending}
                    onClick={() => act.mutate(() => rejectHeldTopic(api, schedule.id, topic.id))}
                  >
                    <XIcon aria-hidden="true" strokeWidth={1.75} />
                  </IconButton>
                </>
              }
            />
          ))}
        </List>
      )}
      <Callout
        title={`Keeps at least ${String(schedule.topicGeneration.keepAtLeast)} ${schedule.topicGeneration.keepAtLeast === 1 ? "topic" : "topics"} queued.`}
      >
        {hold
          ? "New suggestions wait here for you. Change this under Schedules → Edit."
          : "New suggestions join the queue straight away. Change this under Schedules → Edit."}
      </Callout>
    </section>
  );
}
