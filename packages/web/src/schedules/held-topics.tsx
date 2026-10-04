import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import type { HeldTopic } from "@app/slices/schedules/schema.js";
import { templateKeywords } from "@app/slices/schedules/topic-list.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Callout } from "@/components/kit/callout";
import { ConfirmDialog } from "@/components/kit/dialog";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { Rule } from "@/components/kit/layout";
import { List } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { counted, SelectionBar, useSelection } from "@/components/selection";
import { readProjectTemplate } from "@/templates/api";
import {
  approveAllHeldTopics,
  approveHeldTopic,
  approveHeldTopicsById,
  calendarKey,
  editHeldTopic,
  generateTopicsNow,
  heldTopicsKey,
  readHeldTopics,
  rejectHeldTopics,
  restoreHeldTopics,
  type ScheduleReply,
  schedulesKey,
} from "./api";
import { type Editing, HeldTopicRow } from "./held-topic-row";
import { formatScheduleDateZoned } from "./time";
import { TopicFailure } from "./topic-failure";

export { heldValuesLine } from "./held-topic-row";

const named = (topics: readonly HeldTopic[]): string =>
  topics.length === 1 ? `“${topics[0]?.title ?? ""}”` : counted(topics.length, "topic", "topics");

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
  const notify = useToast();
  const [editing, setEditing] = useState<Editing | null>(null);
  const [confirmReject, setConfirmReject] = useState(false);
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
  const rows = held.data ?? [];
  const selection = useSelection(rows.map((topic) => topic.id));
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
  const busy = action.isPending;
  // A job whose success is announced, with Undo when it can be taken back.
  const run = (
    job: () => Promise<ScheduleReply<unknown>>,
    done?: { readonly message: string; readonly undo?: () => void },
  ) =>
    action.mutate(job, {
      onSuccess: (reply) => {
        if (!reply.ok || done === undefined) return;
        selection.clear();
        notify(
          done.message,
          "success",
          done.undo === undefined ? undefined : { label: "Undo", run: done.undo },
        );
      },
    });
  const reject = (topics: readonly HeldTopic[]) =>
    run(
      () =>
        rejectHeldTopics(
          api,
          schedule.id,
          topics.map((topic) => topic.id),
        ),
      {
        message: `Turned down ${named(topics)}. Later generations won't suggest ${topics.length === 1 ? "it" : "them"} again.`,
        undo: () =>
          run(() => restoreHeldTopics(api, schedule.id, topics), {
            message: `${named(topics)} ${topics.length === 1 ? "is" : "are"} waiting again.`,
          }),
      },
    );
  const approve = (topics: readonly HeldTopic[]) =>
    run(
      () =>
        topics.length === 1 && topics[0] !== undefined
          ? approveHeldTopic(api, schedule.id, topics[0].id)
          : approveHeldTopicsById(
              api,
              schedule.id,
              topics.map((topic) => topic.id),
            ),
      { message: `Approved ${named(topics)}: added to the end of the queue.` },
    );
  const picked = rows.filter((topic) => selection.has(topic.id));
  if (!live || schedule.topicGeneration.mode === "off") return null;
  const { topics } = schedule;
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
              ? `Topics last generated ${formatScheduleDateZoned(topics.generatedAt, schedule.timezone)}.`
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
      <TopicFailure
        schedule={schedule}
        title="The last topic generation failed."
        className="mt-3"
        retry={{
          run: () => action.mutate(() => generateTopicsNow(api, schedule.id)),
          busy: busy || topics.generatingSince !== null,
        }}
      />
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
              onClick={() =>
                run(() => approveAllHeldTopics(api, schedule.id), {
                  message: `Approved ${named(rows)}: added to the end of the queue.`,
                })
              }
            >
              Approve all
            </Button>
            <Button
              variant="quiet"
              disabled={busy || rows.length === 0}
              disabledReason="Nothing is waiting"
              onClick={() => setConfirmReject(true)}
            >
              Reject all
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
            // Esc anywhere in the list clears the ticked rows.
            // biome-ignore lint/a11y/noStaticElementInteractions: Esc is handed down from the rows' own controls.
            <div onKeyDown={selection.onKeyDown}>
              {rows.length > 1 ? (
                <SelectionBar
                  className="mt-2"
                  selection={selection}
                  total={rows.length}
                  noun={["topic waiting", "topics waiting"]}
                  actions={
                    <>
                      <Button
                        size="small"
                        disabled={busy || picked.length === 0}
                        disabledReason="Tick the topics to approve"
                        onClick={() => approve(picked)}
                      >
                        Approve selected
                      </Button>
                      <Button
                        size="small"
                        variant="quiet"
                        disabled={busy || picked.length === 0}
                        disabledReason="Tick the topics to turn down"
                        onClick={() => reject(picked)}
                      >
                        Reject selected
                      </Button>
                    </>
                  }
                />
              ) : null}
              <List label="Topics waiting" className="mt-2 [&_.sl-row__actions]:flex-wrap">
                {rows.map((topic) => (
                  <HeldTopicRow
                    key={topic.id}
                    topic={topic}
                    editing={editing?.id === topic.id ? editing : undefined}
                    keywords={keywords}
                    everyRun={everyRun}
                    busy={busy}
                    selection={selection}
                    onEdit={setEditing}
                    onCancel={() => setEditing(null)}
                    onSave={() => {
                      if (editing === null) return;
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
                      );
                    }}
                    onApprove={() => approve([topic])}
                    onReject={() => reject([topic])}
                  />
                ))}
              </List>
            </div>
          )}
          <ConfirmDialog
            open={confirmReject}
            title={`Reject all ${counted(rows.length, "waiting topic", "waiting topics")}?`}
            consequence={`Turns down the ${counted(rows.length, "topic", "topics")} waiting for ${schedule.name} now (topics generated after this list was shown are not included). Later generations won't suggest them again; Undo in the message that follows brings them back.`}
            confirmLabel={`Reject ${counted(rows.length, "topic", "topics")}`}
            cancelLabel="Keep them waiting"
            pending={busy}
            onCancel={() => setConfirmReject(false)}
            onConfirm={() => {
              setConfirmReject(false);
              reject(rows);
            }}
          />
        </div>
      ) : null}
    </section>
  );
}
