import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Dialog } from "@/components/kit/dialog";
import { Field, Select, Textarea } from "@/components/kit/field";
import { useToast } from "@/components/kit/toast";
import { calendarKey, schedulesKey, updateSchedule } from "@/schedules/api";

// "Add to calendar": topics typed or pasted one per line join the end of a schedule's queue,
// so they take the next free runs of that schedule. A batch is just this.

export function topicLines(text: string): readonly string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

export function AddToCalendar({
  open,
  onOpenChange,
  schedules,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly schedules: readonly ScheduleSummary[];
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const usable = schedules.filter(
    (one) => one.deletedAt === null && (one.status === "active" || one.status === "paused"),
  );
  const [scheduleId, setScheduleId] = useState<string>("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const picked = usable.find((one) => one.id === scheduleId) ?? usable[0];
  const topics = topicLines(text);

  const add = useMutation({
    mutationFn: async (schedule: ScheduleSummary) => {
      const { id, ...rest } = schedule;
      return updateSchedule(api, id, {
        name: rest.name,
        templateId: rest.templateId,
        templateVersion: rest.templateVersion,
        cadence: rest.cadence,
        timezone: rest.timezone,
        missedPolicy: rest.missedPolicy,
        overlapPolicy: rest.overlapPolicy,
        spendLimitCents: rest.spendLimitCents,
        items: [...rest.items, ...topics.map((title) => ({ title, values: {} }))],
        topicKeyword: rest.topicKeyword,
        values: rest.values,
        brief: rest.brief,
        topicGeneration: rest.topicGeneration,
        baseVersion: rest.version,
        mutationId: crypto.randomUUID(),
      });
    },
    onSuccess: (reply, schedule) => {
      if (!reply.ok) {
        setError(
          reply.reason === "conflict"
            ? `${schedule.name} changed while you were typing. Your topics are kept: press Add to calendar again.`
            : reply.message,
        );
        return;
      }
      notify(
        `Added ${String(topics.length)} ${topics.length === 1 ? "topic" : "topics"} to ${schedule.name}.`,
        "success",
      );
      setText("");
      setError(undefined);
      onOpenChange(false);
    },
    onError: (cause: Error) =>
      setError(`The topics weren't added: ${cause.message} Your text is kept; try again.`),
    onSettled: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: schedulesKey }),
        client.invalidateQueries({ queryKey: calendarKey }),
      ]);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add to calendar"
      description="Each line becomes a topic at the end of the schedule's queue, so it takes that schedule's next free run."
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Keep the calendar as it is
          </Button>
          <Button
            variant="primary"
            disabled={picked === undefined || topics.length === 0 || add.isPending}
            disabledReason={
              picked === undefined
                ? "Create a schedule first."
                : topics.length === 0
                  ? "Type at least one topic."
                  : "Adding…"
            }
            onClick={() => {
              if (picked !== undefined) add.mutate(picked);
            }}
          >
            {topics.length === 0
              ? "Add to calendar"
              : `Add ${String(topics.length)} ${topics.length === 1 ? "topic" : "topics"}`}
          </Button>
        </>
      }
    >
      {usable.length === 0 ? (
        <p className="m-0 text-ink-2">
          Topics go on a schedule, and there is none yet.{" "}
          <Link to="/schedules">Create a schedule</Link> first.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <Field label="Schedule">
            <Select
              value={picked?.id ?? ""}
              onChange={(event) => setScheduleId(event.target.value)}
            >
              {usable.map((one) => (
                <option key={one.id} value={one.id}>
                  {`${one.name} · ${String(one.items.length)} queued`}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Topics, one per line" error={error}>
            <Textarea
              rows={8}
              value={text}
              placeholder={"Lolth\nThe Eye and Hand of Vecna\nThe Dead Three"}
              onChange={(event) => setText(event.target.value)}
            />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
