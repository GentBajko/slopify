import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { templateKeywords } from "@app/slices/schedules/topic-list.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { Field, Input } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Rule } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { readProjectTemplate } from "@/templates/api";
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

interface Editing {
  readonly id: string;
  readonly title: string;
  readonly values: Readonly<Record<string, string>>;
}

// "Word Count: 12000 · Tone: calm": the keywords a held topic sets, under its title.
export function heldValuesLine(values: Readonly<Record<string, string>>): string | undefined {
  const set = Object.entries(values);
  return set.length === 0 ? undefined : set.map(([name, value]) => `${name}: ${value}`).join(" · ");
}

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
  const [editing, setEditing] = useState<Editing | null>(null);
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
  // The template's keywords, which Edit offers beside the title, as the queue's table does.
  const template = useQuery({
    queryKey: ["project-template", schedule.templateId],
    enabled: live && schedule.topicGeneration.mode === "hold",
    queryFn: async () => {
      const reply = await readProjectTemplate(api, schedule.templateId);
      if (!reply.ok) throw new Error(reply.message);
      return reply.value;
    },
  });
  const form = template.data?.document.form;
  const keywords = (form === undefined ? [] : templateKeywords(form)).filter(
    (name) => name !== schedule.topicKeyword,
  );
  // What a keyword left empty falls back on: the schedule's every-run value, else the template's.
  const everyRun = (name: string): string => schedule.values[name] ?? form?.values[name] ?? "";
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
                      <div className="flex min-w-0 flex-col gap-2">
                        <Input
                          aria-label={`Edit ${topic.title}`}
                          className="w-full"
                          maxLength={200}
                          value={editing.title}
                          onChange={(event) =>
                            setEditing({ ...editing, title: event.target.value })
                          }
                        />
                        {keywords.length === 0 ? null : (
                          <div className="grid grid-cols-1 gap-2 min-[600px]:grid-cols-2">
                            {keywords.map((name) => (
                              <Field key={name} label={name} tip="planning.schedule.held-keywords">
                                <Input
                                  maxLength={2000}
                                  placeholder={everyRun(name) || "Not set"}
                                  value={editing.values[name] ?? ""}
                                  onChange={(event) =>
                                    setEditing({
                                      ...editing,
                                      values: { ...editing.values, [name]: event.target.value },
                                    })
                                  }
                                />
                              </Field>
                            ))}
                          </div>
                        )}
                      </div>
                    ) : (
                      topic.title
                    )
                  }
                  meta={editing?.id === topic.id ? undefined : heldValuesLine(topic.values)}
                  actions={
                    editing?.id === topic.id ? (
                      <>
                        <Button
                          size="small"
                          disabled={busy || editing.title.trim() === ""}
                          onClick={() =>
                            action.mutate(() =>
                              editHeldTopic(
                                api,
                                schedule.id,
                                topic.id,
                                editing.title.trim(),
                                Object.fromEntries(
                                  Object.entries(editing.values).filter(
                                    ([, value]) => value.trim() !== "",
                                  ),
                                ),
                              ),
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
                          onClick={() =>
                            setEditing({ id: topic.id, title: topic.title, values: topic.values })
                          }
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
