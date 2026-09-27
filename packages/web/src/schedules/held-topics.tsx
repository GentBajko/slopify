import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    <section className="mt-3 border-t border-line pt-3 pl-6" aria-label="Topic generation">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="min-w-0 flex-1 text-small text-ink2">
          {topics.generatingSince !== null
            ? "Generating topics now…"
            : topics.generatedAt !== null
              ? `Topics last generated ${formatScheduleDate(topics.generatedAt, schedule.timezone)}.`
              : "No topics generated yet."}{" "}
          Keeps at least {schedule.topicGeneration.keepAtLeast}{" "}
          {schedule.topicGeneration.mode === "hold" ? "queued or waiting" : "queued"}.
        </p>
        <Button
          type="button"
          disabled={busy || topics.generatingSince !== null}
          onClick={() => action.mutate(() => generateTopicsNow(api, schedule.id))}
        >
          Generate topics now
        </Button>
      </div>
      {topics.error !== null ? (
        <p role="alert" className="mt-2 text-small text-red">
          {topics.error}
        </p>
      ) : null}
      {error !== null ? (
        <p role="alert" className="mt-2 text-small text-red">
          {error}
        </p>
      ) : null}
      {schedule.topicGeneration.mode === "hold" ? (
        <div className="mt-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex-1 text-small font-semibold">Topics waiting · {rows.length}</h3>
            <Button
              type="button"
              variant="primary"
              disabled={busy || rows.length === 0}
              onClick={() => action.mutate(() => approveAllHeldTopics(api, schedule.id))}
            >
              Approve all
            </Button>
          </div>
          {held.error ? (
            <p className="mt-2 text-small text-red">{held.error.message}</p>
          ) : rows.length === 0 ? (
            <p className="mt-2 text-small text-ink3">
              Nothing is waiting. New topics appear here for you to approve.
            </p>
          ) : (
            <ol className="mt-2 space-y-2">
              {rows.map((topic) => (
                <li key={topic.id} className="flex flex-wrap items-center gap-2 text-small">
                  {editing?.id === topic.id ? (
                    <Input
                      aria-label={`Edit ${topic.title}`}
                      className="min-w-0 flex-1"
                      maxLength={200}
                      value={editing.title}
                      onChange={(event) => setEditing({ id: topic.id, title: event.target.value })}
                    />
                  ) : (
                    <span className="min-w-0 flex-1 break-words">{topic.title}</span>
                  )}
                  {editing?.id === topic.id ? (
                    <>
                      <Button
                        type="button"
                        disabled={busy || editing.title.trim() === ""}
                        onClick={() =>
                          action.mutate(() =>
                            editHeldTopic(api, schedule.id, topic.id, editing.title.trim()),
                          )
                        }
                      >
                        Save
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          action.mutate(() => approveHeldTopic(api, schedule.id, topic.id))
                        }
                      >
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() => setEditing({ id: topic.id, title: topic.title })}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        disabled={busy}
                        onClick={() =>
                          action.mutate(() => rejectHeldTopic(api, schedule.id, topic.id))
                        }
                      >
                        Reject
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
