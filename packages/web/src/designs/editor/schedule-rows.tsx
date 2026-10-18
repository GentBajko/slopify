import { designFields } from "@app/slices/designs/fields.js";
import type { DesignDocument } from "@app/slices/designs/schema.js";
import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { Button, IconButton } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { SectionHead } from "@/components/kit/section-head";
import { type Column, DataTable } from "@/components/kit/stats";
import { Status } from "@/components/kit/status";
import { keys } from "@/queries";
import {
  createSchedule,
  scheduleAction,
  schedulesKey,
  schedulesQuery,
  updateSchedule,
} from "@/schedules/api";
import type { TemplateView } from "../api";

// A design template's schedule: one row per piece, each with its fields and its date. Slopify
// makes each row's piece the set number of days ahead of its date, from the version marked
// ready, and takes the row off the table. The rows are the schedule's own, saved here.

type Row = Readonly<Record<string, string>> & { readonly _key: string };

function rowsOf(schedule: ScheduleSummary | undefined): Row[] {
  return (schedule?.items ?? []).map((item, index) => ({
    ...item.values,
    _key: `saved-${String(index)}`,
  }));
}

// A row's title is its first field that isn't the date: the name a piece gets.
function titleOf(
  row: Readonly<Record<string, string>>,
  fields: readonly string[],
  dateField: string,
): string {
  const named = fields.filter((name) => name !== dateField).map((name) => (row[name] ?? "").trim());
  return (named.find((value) => value !== "") ?? row[dateField] ?? "Piece").slice(0, 200);
}

export function ScheduleRows({
  template,
  saved,
  dirty,
}: {
  readonly template: TemplateView;
  // The template's document as saved; the rows follow its fields and date field.
  readonly saved: DesignDocument;
  readonly dirty: boolean;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const schedules = useQuery(schedulesQuery(api));
  const schedule = schedules.data?.find(
    (one) =>
      one.templateKind === "design" &&
      one.templateId === template.id &&
      one.deletedAt === null &&
      one.status !== "canceled",
  );
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const shown = rows ?? rowsOf(schedule);
  const fields = designFields(saved);
  const dateField = saved.schedule?.dateField;
  const save = useMutation({
    mutationFn: async () => {
      if (dateField === undefined)
        throw new Error("Choose which field holds each date, then save the template.");
      const items = shown.map(({ _key, ...values }) => ({
        title: titleOf(values, fields, dateField),
        values,
      }));
      const common = {
        name: template.name,
        templateKind: "design" as const,
        templateId: template.id,
        templateVersion: template.headVersion,
        cadence: { kind: "by-date" as const, time: saved.schedule?.time ?? "09:00" },
        timezone: schedule?.timezone ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"),
        missedPolicy: "skip" as const,
        overlapPolicy: "skip" as const,
        spendLimitCents: schedule?.spendLimitCents ?? null,
        items,
        topicKeyword: null,
        values: {},
        brief: null,
        topicGeneration: { mode: "off" as const, keepAtLeast: 10, llm: null },
        releases: [],
      };
      return schedule === undefined
        ? createSchedule(api, { id: crypto.randomUUID(), ...common })
        : updateSchedule(api, schedule.id, {
            ...common,
            baseVersion: schedule.version,
            mutationId: crypto.randomUUID(),
          });
    },
    onSuccess: async (result) => {
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setRows(null);
      setMessage(
        result.value.nextRunAt === null
          ? "Saved. No row has a date still to come."
          : `Saved. The next piece is made ${new Date(result.value.nextRunAt).toLocaleString()}.`,
      );
      await client.invalidateQueries({ queryKey: schedulesKey });
      await client.invalidateQueries({ queryKey: keys.calendar });
    },
    onError: (error) => setMessage(error.message),
  });
  const pause = useMutation({
    mutationFn: async () =>
      schedule === undefined
        ? undefined
        : scheduleAction(
            api,
            schedule.id,
            schedule.status === "paused" ? "resume" : "pause",
            schedule.version,
          ),
    onSuccess: () => client.invalidateQueries({ queryKey: schedulesKey }),
  });
  const set = (key: string, name: string, value: string) =>
    setRows(shown.map((row) => (row._key === key ? { ...row, [name]: value } : row)));
  const columns: Column<Row>[] = [
    ...fields.map(
      (name): Column<Row> => ({
        id: name,
        header: name,
        cell: (row) => (
          <Input
            aria-label={`${name} of row ${String(shown.indexOf(row) + 1)}`}
            type={name === dateField ? "date" : "text"}
            value={row[name] ?? ""}
            onChange={(event) => set(row._key, name, event.target.value)}
            className="min-w-[8rem]"
          />
        ),
      }),
    ),
    {
      id: "remove",
      header: <span className="sr-only">Remove</span>,
      cell: (row) => (
        <IconButton
          label={`Remove row ${String(shown.indexOf(row) + 1)}`}
          onClick={() => setRows(shown.filter((one) => one._key !== row._key))}
        >
          <Trash2Icon aria-hidden="true" className="size-4" />
        </IconButton>
      ),
    },
  ];
  const blocked = dirty
    ? "Save the template first: the rows follow its saved fields."
    : dateField === undefined
      ? "Choose which field holds each date above, then save the template."
      : rows === null
        ? "Change a row first."
        : undefined;
  return (
    <div data-setting="rows" className="flex min-w-0 flex-col gap-3">
      <SectionHead
        as="h3"
        size="small"
        title="Rows"
        meta={
          schedule === undefined
            ? "No schedule yet: add a row for each event and save."
            : schedule.status === "paused"
              ? "Paused: nothing is made until you resume."
              : schedule.nextRunAt === null
                ? "Waiting for a row with a date still to come."
                : `Next piece: ${new Date(schedule.nextRunAt).toLocaleString()}`
        }
        status={
          schedule === undefined ? undefined : (
            <Status tone={schedule.status === "active" ? "running" : "waiting"}>
              {schedule.status === "active" ? "Running" : "Paused"}
            </Status>
          )
        }
      >
        {schedule === undefined ? null : (
          <Button
            size="small"
            variant="quiet"
            disabled={pause.isPending}
            onClick={() => pause.mutate()}
          >
            {schedule.status === "paused" ? "Resume" : "Pause"}
          </Button>
        )}
      </SectionHead>
      {/* Relative, so the hidden column names scroll with the table instead of widening the page. */}
      <div className="relative min-w-0 overflow-x-auto">
        <DataTable
          caption="The schedule's rows"
          columns={columns}
          rows={shown}
          rowKey={(row) => row._key}
          empty="No rows yet."
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="small"
          disabled={fields.length === 0}
          onClick={() =>
            setRows([
              ...shown,
              {
                ...Object.fromEntries(fields.map((name) => [name, ""])),
                _key: crypto.randomUUID(),
              },
            ])
          }
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          Add a row
        </Button>
        <Button
          size="small"
          disabled={blocked !== undefined || save.isPending}
          disabledReason={blocked}
          focusableWhenDisabled
          onClick={() => {
            setMessage(null);
            save.mutate();
          }}
        >
          {schedule === undefined ? "Start the schedule" : "Save rows"}
        </Button>
        <p role="status" className="m-0 min-w-0 text-small text-ink-2">
          {message ??
            (template.readyVersion === null
              ? "Nothing is made until a version is marked ready."
              : `Pieces are made from version ${String(template.readyVersion)}.`)}
        </p>
      </div>
    </div>
  );
}
