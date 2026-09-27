import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Rule } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import {
  approveAllHeldTopics,
  approveHeldTopic,
  calendarKey,
  editHeldTopic,
  generateTopicsNow,
  heldTopicsKey,
  readHeldTopics,
  rejectHeldTopic,
  type ScheduleReply,
  schedulesKey,
} from "./api";
import { formatScheduleDate } from "./time";

// A schedule's topic generation: what went wrong last, a button to ask now, and the topics
// held for approval with a visible action on every row.
export function TopicGenerationPanel({
  schedule,
}: {
  readonly schedule: ScheduleSummary;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ readonly id: string; readonly title: string } | null>(
    null,
  );
  const live =
    schedule.deletedAt === null && (schedule.status === "active" || schedule.status === "paused");
  const held = useQuery({
    // Refetched when a generation or a run changes the count the schedule reports.
    queryKey: [...heldTopicsKey(schedule.id), schedule.topics.held, schedule.topics.generatedAt],
    enabled: live && schedule.topicGeneration.mode === "hold",
    queryFn: async () => {
      const reply = await readHeldTopics(api, schedule.id);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  });
  const action = useMutation({
    mutationFn: (job: () => Promise<ScheduleReply<unknown>>) => job(),
    onSuccess: (reply) => {
      setError(reply.ok ? null : reply.message);
      if (reply.ok) setEditing(null);
    },
    onError: (cause: Error) => setError(cause.message),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: schedulesKey }),
        client.invalidateQueries({ queryKey: heldTopicsKey(schedule.id) }),
        client.invalidateQueries({ queryKey: calendarKey }),
      ]);
    },
  });
  if (!live || schedule.topicGeneration.mode === "off") return null;
  const { topics } = schedule;
  const busy = action.isPending;
  const rows = held.data ?? [];
  return (
    <section aria-label="Topic generation">
      <Rule className="my-6" />
      <SectionHead
        as="h3"
        title="Topic generation"
        meta={`${
          topics.generatingSince !== null
            ? "Generating topics now…"
            : topics.generatedAt !== null
              ? `Topics last generated ${formatScheduleDate(topics.generatedAt, schedule.timezone)}.`
              : "No topics generated yet."
        } Keeps at least ${String(schedule.topicGeneration.keepAtLeast)} ${
          schedule.topicGeneration.mode === "hold" ? "queued or waiting" : "queued"
        }.`}
      >
        <InfoTip id="planning.schedule.generate-now" />
        <Button
          disabled={busy || topics.generatingSince !== null}
          disabledReason="Topics are being generated now"
          onClick={() => action.mutate(() => generateTopicsNow(api, schedule.id))}
        >
          Generate topics now
        </Button>
      </SectionHead>
      {topics.error !== null ? (
        <Callout tone="danger" title="The last topic generation failed." className="mt-3">
          {topics.error}
        </Callout>
      ) : null}
      {error !== null ? (
        <Callout tone="danger" title="That didn't work." className="mt-3">
          {error}
        </Callout>
      ) : null}
      {schedule.topicGeneration.mode === "hold" ? (
        <div className="mt-4" {...helpScope}>
          <SectionHead
            as="h3"
            title={`Topics waiting · ${String(rows.length)}`}
            info="planning.schedule.held"
          >
            <Button
              variant="primary"
              disabled={busy || rows.length === 0}
              disabledReason="Nothing is waiting"
              onClick={() => action.mutate(() => approveAllHeldTopics(api, schedule.id))}
            >
              Approve all
            </Button>
          </SectionHead>
          {held.error ? (
            <p className="m-0 mt-2 text-small text-danger">
              {`The waiting topics couldn't be loaded: ${held.error.message} Reload the page to try again.`}
            </p>
          ) : rows.length === 0 ? (
            <p className="m-0 mt-2 text-small text-ink-3">
              Nothing is waiting. New topics appear here for you to approve.
            </p>
          ) : (
            <List label="Topics waiting" className="mt-2 [&_.sl-row__actions]:flex-wrap">
              {rows.map((topic) => (
                <ListRow
                  key={topic.id}
                  title={
                    editing?.id === topic.id ? (
                      <Input
                        aria-label={`Edit ${topic.title}`}
                        className="w-full"
                        maxLength={200}
                        value={editing.title}
                        onChange={(event) =>
                          setEditing({ id: topic.id, title: event.target.value })
                        }
                      />
                    ) : (
                      topic.title
                    )
                  }
                  actions={
                    editing?.id === topic.id ? (
                      <>
                        <Button
                          size="small"
                          disabled={busy || editing.title.trim() === ""}
                          onClick={() =>
                            action.mutate(() =>
                              editHeldTopic(api, schedule.id, topic.id, editing.title.trim()),
                            )
                          }
                        >
                          Save
                        </Button>
                        <Button variant="quiet" size="small" onClick={() => setEditing(null)}>
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            action.mutate(() => approveHeldTopic(api, schedule.id, topic.id))
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          variant="quiet"
                          size="small"
                          disabled={busy}
                          onClick={() => setEditing({ id: topic.id, title: topic.title })}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="quiet"
                          size="small"
                          disabled={busy}
                          onClick={() =>
                            action.mutate(() => rejectHeldTopic(api, schedule.id, topic.id))
                          }
                        >
                          Reject
                        </Button>
                      </>
                    )
                  }
                />
              ))}
            </List>
          )}
        </div>
      ) : null}
    </section>
  );
}
