import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { calendarMaxDays } from "@app/slices/schedules/schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Fragment, type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery, defaultChannelId } from "@/channels/api";
import { channelOfTemplate } from "@/channels/members-tabs";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { ListDetail, Rule } from "@/components/kit/layout";
import { List, ListRow } from "@/components/kit/list-row";
import { SectionHead } from "@/components/kit/section-head";
import { Status, type Tone } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { RetiredModelRow } from "@/components/retired-models";
import { intents, useIntent } from "@/lib/intents";
import {
  calendarQuery,
  deleteSchedule,
  readSchedule,
  scheduleAction,
  schedulesKey,
  schedulesQuery,
} from "@/schedules/api";
import { ScheduleForm } from "@/schedules/form";
import { TopicGenerationPanel } from "@/schedules/held-topics";
import { InlineTopics } from "@/schedules/inline-topics";
import { formatScheduleDate } from "@/schedules/time";
import { templatesQuery } from "@/templates/api";

type Reply = { readonly ok: true } | { readonly ok: false; readonly message: string };
type Act = (job: () => Promise<Reply>) => void;

// Calendar → Schedules tab: the schedules as a list beside the picked one's detail (its topics,
// policy and run history). New schedule and Edit open the form in place of the detail. Every
// row carries its own Edit, Pause or Resume, and Delete. The calendar keeps the picked schedule
// in its URL (`/calendar?tab=schedules&schedule=…`), so a link can open one; without
// `onPick` the pick lives here.
export function SchedulesView({
  pickedId,
  onPick,
}: {
  readonly pickedId?: string | undefined;
  readonly onPick?: ((scheduleId: string) => void) | undefined;
} = {}): ReactElement {
  const { api } = useApp();
  const queryClient = useQueryClient();
  const schedules = useQuery(schedulesQuery(api));
  const templates = useQuery(templatesQuery(api));
  const [error, setError] = useState<string | null>(null);
  const notify = useToast();
  const [editing, setEditing] = useState<ScheduleSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [formBusy, setFormBusy] = useState(false);
  const [ownPick, setOwnPick] = useState<string | null>(null);
  const picked = onPick === undefined ? ownPick : (pickedId ?? null);
  const setPicked = (scheduleId: string) => {
    if (onPick === undefined) setOwnPick(scheduleId);
    else onPick(scheduleId);
  };
  const [confirm, setConfirm] = useState<{
    readonly kind: "cancel" | "delete";
    readonly schedule: ScheduleSummary;
  } | null>(null);
  const active = useRef(false);
  const channels = useQuery(channelsQuery(api));
  // The project title each schedule's next run will get, from the calendar (the server builds
  // it the way the run will). A range fixed at mount, so the query key stays put.
  const [range] = useState(() => {
    const from = new Date();
    return {
      from: from.toISOString(),
      to: new Date(from.valueOf() + calendarMaxDays * 24 * 60 * 60_000).toISOString(),
    };
  });
  const calendar = useQuery(calendarQuery(api, range.from, range.to));
  const nextTitles = new Map<string, string>();
  for (const run of calendar.data?.runs ?? [])
    if (run.renderedTitle !== null && !nextTitles.has(run.scheduleId))
      nextTitles.set(run.scheduleId, run.renderedTitle);
  // "" shows every channel's schedules; a schedule's channel is its template's.
  const [channelFilter, setChannelFilter] = useState("");
  const inChannel = (schedule: ScheduleSummary): boolean => {
    if (channelFilter === "") return true;
    const template = templates.data?.find((one) => one.id === schedule.templateId);
    return (template ? channelOfTemplate(template) : defaultChannelId) === channelFilter;
  };
  const liveSchedules =
    schedules.data?.filter((schedule) => schedule.deletedAt === null && inChannel(schedule)) ?? [];
  const deletedSchedules = schedules.data?.filter((schedule) => schedule.deletedAt !== null) ?? [];
  // The detail shows the picked schedule, else the first live one.
  const selected =
    schedules.data?.find((schedule) => schedule.id === picked) ?? liveSchedules[0] ?? null;
  const mutation = useMutation({
    onError: (cause: Error) => setError(cause.message),
    onSettled: async () => {
      active.current = false;
      await queryClient.invalidateQueries({ queryKey: schedulesKey });
    },
    mutationFn: async (job: () => Promise<Reply>) => job(),
    onSuccess: async (result) => {
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setError(null);
    },
  });

  const act: Act = (job) => {
    if (active.current) return;
    active.current = true;
    setError(null);
    mutation.mutate(job);
  };

  const formOpen = creating || editing !== null;
  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setError(null);
  };
  const noTemplates = templates.data?.length === 0;
  const startNew = () => {
    if (formOpen || noTemplates) return;
    setEditing(null);
    setCreating(true);
    setError(null);
  };
  const edit = (schedule: ScheduleSummary) => {
    setCreating(false);
    setPicked(schedule.id);
    setEditing(schedule);
    setError(null);
  };
  useCommand({
    id: "schedules.new",
    title: "New schedule",
    group: "Schedules",
    keywords: ["calendar", "recurring"],
    run: startNew,
  });
  // "New schedule" run from another screen lands here (`components/global-commands.tsx`).
  useIntent(
    intents.newSchedule,
    () => {
      if (noTemplates)
        notify(
          "A schedule runs a project template, and there is none yet. Open a project, choose Save as template, then run New schedule again.",
          "error",
        );
      else startNew();
    },
    templates.data !== undefined,
  );
  const status = error
    ? ({ tone: "error", text: error } as const)
    : schedules.error
      ? ({
          tone: "error",
          text: `The schedules couldn't be loaded: ${schedules.error.message} Reload the page to try again.`,
        } as const)
      : templates.error
        ? ({
            tone: "error",
            text: `The templates couldn't be loaded: ${templates.error.message} Reload the page to try again.`,
          } as const)
        : undefined;
  const rowPending = mutation.isPending || formBusy || formOpen;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="m-0 min-w-0 text-small text-ink-2">
          {noTemplates ? (
            <>
              Save a template in{" "}
              <Link className="underline" to="/templates">
                Library → Templates
              </Link>{" "}
              before creating a schedule.
            </>
          ) : (
            <span className="inline-flex items-center gap-1">
              Runs a saved template on this machine at a local time.
              <InfoTip id="planning.schedules" />
            </span>
          )}
        </p>
        <ButtonRow>
          <Select
            aria-label="Filter schedules by channel"
            value={channelFilter}
            className="w-auto min-w-[160px]"
            onChange={(event) => setChannelFilter(event.target.value)}
          >
            <option value="">All channels</option>
            {(channels.data ?? []).map((channel) => (
              <option key={channel.id} value={channel.id}>
                {channel.name}
              </option>
            ))}
          </Select>
          <Button
            variant="primary"
            onClick={startNew}
            disabled={formOpen || noTemplates}
            disabledReason={
              noTemplates
                ? "Save a template in Library → Templates first"
                : "Finish or cancel the open form first"
            }
          >
            <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
            New schedule
          </Button>
        </ButtonRow>
      </div>
      <StatusSlot tone={formOpen ? "info" : (status?.tone ?? "info")} className="mb-2">
        {formOpen ? undefined : status?.text}
      </StatusSlot>
      <ListDetail
        className="min-[768px]:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]"
        list={
          <>
            {schedules.data && liveSchedules.length === 0 ? (
              <EmptyState
                title={
                  channelFilter !== ""
                    ? "No schedules run this channel's templates"
                    : deletedSchedules.length === 0
                      ? "No schedules yet"
                      : "No active schedules"
                }
              >
                {channelFilter !== ""
                  ? "Pick All channels to see the others, or make one from this channel's templates."
                  : deletedSchedules.length === 0
                    ? "Your first one can be a one-off run or a recurring series. Press New schedule."
                    : "Create one with New schedule, or review deleted history below."}
              </EmptyState>
            ) : null}
            {liveSchedules.length > 0 ? (
              <List label="Saved schedules" className="[&_.sl-row__actions]:flex-wrap">
                {liveSchedules.map((schedule) => (
                  <Fragment key={schedule.id}>
                    <ScheduleRow
                      schedule={schedule}
                      nextTitle={nextTitles.get(schedule.id)}
                      selected={!formOpen && selected?.id === schedule.id}
                      pending={rowPending}
                      onSelect={() => setPicked(schedule.id)}
                      onEdit={() => edit(schedule)}
                      onAction={act}
                      onConfirm={(kind) => setConfirm({ kind, schedule })}
                    />
                    <RetiredModelRow kind="schedule" id={schedule.id} name={schedule.name} />
                  </Fragment>
                ))}
              </List>
            ) : null}
            {deletedSchedules.length > 0 ? (
              <details className="mt-6">
                <summary className="cursor-pointer text-small font-semibold text-ink-2">
                  Deleted schedules · {deletedSchedules.length}
                </summary>
                <p className="m-0 mt-2 mb-2 text-small text-ink-2">
                  Deleted schedules stay in Settings → Trash for 30 days, where Restore brings one
                  back paused. Pick one to see its run history.
                </p>
                <List label="Deleted schedules">
                  {deletedSchedules.map((schedule) => (
                    <ScheduleRow
                      key={schedule.id}
                      schedule={schedule}
                      nextTitle={undefined}
                      selected={!formOpen && selected?.id === schedule.id}
                      pending={false}
                      onSelect={() => setPicked(schedule.id)}
                      onEdit={() => undefined}
                      onAction={act}
                      onConfirm={() => undefined}
                    />
                  ))}
                </List>
              </details>
            ) : null}
          </>
        }
        detail={
          formOpen ? (
            <div>
              <SectionHead
                kicker={editing ? editing.name : undefined}
                title={editing ? "Edit schedule" : "New schedule"}
                className="mb-4"
              />
              <ScheduleForm
                onBusy={setFormBusy}
                key={editing?.id ?? "new"}
                editing={editing}
                onCancel={() => {
                  if (!formBusy) closeForm();
                }}
                templates={templates.data ?? []}
                pending={mutation.isPending}
                error={error}
                onCreated={() => {
                  notify(
                    editing
                      ? "Schedule updated."
                      : "Schedule saved. It will run automatically while Slopify is open.",
                    "success",
                  );
                  closeForm();
                  void queryClient.invalidateQueries({ queryKey: schedulesKey });
                }}
                onError={(message) => {
                  setError(message);
                  void queryClient.invalidateQueries({ queryKey: schedulesKey });
                }}
              />
            </div>
          ) : selected ? (
            <ScheduleDetail
              key={selected.id}
              schedule={selected}
              pending={rowPending}
              onAction={act}
              onConfirm={(kind) => setConfirm({ kind, schedule: selected })}
            />
          ) : null
        }
      />
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === "delete" ? "Delete schedule?" : "Cancel schedule?"}
        consequence={
          (confirm?.kind === "delete"
            ? "Moves this schedule to the trash for 30 days (Settings → Trash). Its run history is kept."
            : "Stops future scheduled runs. Existing projects and run history are kept.") +
          (error ? ` ${error}` : "")
        }
        confirmLabel={confirm?.kind === "delete" ? "Delete schedule" : "Cancel schedule"}
        cancelLabel="Keep schedule"
        pending={mutation.isPending}
        onCancel={() => {
          if (!mutation.isPending) setConfirm(null);
        }}
        onConfirm={() => {
          if (!confirm) return;
          const { kind, schedule } = confirm;
          act(async () => {
            const reply =
              kind === "delete"
                ? await deleteSchedule(api, schedule.id, schedule.version)
                : await scheduleAction(api, schedule.id, "cancel", schedule.version);
            if (reply.ok) setConfirm(null);
            return reply;
          });
        }}
      />
    </div>
  );
}

function cadenceOf(schedule: ScheduleSummary): string {
  return schedule.cadence.kind === "once"
    ? "One time"
    : schedule.cadence.kind === "daily"
      ? `Daily at ${schedule.cadence.time}`
      : `Weekly at ${schedule.cadence.time}`;
}

const statusWords: Readonly<Record<ScheduleSummary["status"], string>> = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
};
const statusTones: Readonly<Record<ScheduleSummary["status"], Tone>> = {
  active: "running",
  paused: "waiting",
  completed: "done",
  canceled: "off",
};

function ScheduleStatus({ schedule }: { readonly schedule: ScheduleSummary }): ReactElement {
  return schedule.deletedAt !== null ? (
    <Status tone="off">Deleted</Status>
  ) : (
    <Status tone={statusTones[schedule.status]}>{statusWords[schedule.status]}</Status>
  );
}

function ScheduleRow({
  schedule,
  nextTitle,
  selected,
  pending,
  onSelect,
  onEdit,
  onAction,
  onConfirm,
}: {
  readonly schedule: ScheduleSummary;
  // The project title of the next run, when the calendar knows it.
  readonly nextTitle: string | undefined;
  readonly selected: boolean;
  readonly pending: boolean;
  readonly onSelect: () => void;
  readonly onEdit: () => void;
  readonly onAction: Act;
  readonly onConfirm: (kind: "cancel" | "delete") => void;
}): ReactElement {
  const { api } = useApp();
  const live = schedule.deletedAt === null;
  const editable = live && (schedule.status === "active" || schedule.status === "paused");
  const deletable = schedule.status === "canceled" || schedule.status === "completed";
  return (
    <ListRow
      selected={selected}
      onSelect={onSelect}
      title={schedule.name}
      meta={
        <>
          <ScheduleStatus schedule={schedule} />
          {` · ${cadenceOf(schedule)} · ${
            schedule.deletedAt !== null
              ? `Deleted: ${formatScheduleDate(schedule.deletedAt, schedule.timezone)}`
              : schedule.nextRunAt === null
                ? "No future run"
                : `Next: ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}${
                    nextTitle === undefined ? "" : ` · “${nextTitle}”`
                  }`
          }${schedule.topics.held > 0 ? ` · ${String(schedule.topics.held)} waiting for you` : ""}`}
        </>
      }
      actions={
        live ? (
          <>
            <Button
              variant="quiet"
              size="small"
              aria-label={`Edit ${schedule.name}`}
              disabled={pending || !editable}
              disabledReason={
                editable
                  ? "Finish or cancel the open form first"
                  : "Only a live schedule can change"
              }
              onClick={onEdit}
            >
              Edit
            </Button>
            {schedule.status === "paused" ? (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Resume ${schedule.name}`}
                disabled={pending}
                onClick={() =>
                  onAction(() => scheduleAction(api, schedule.id, "resume", schedule.version))
                }
              >
                Resume
              </Button>
            ) : (
              <Button
                variant="quiet"
                size="small"
                aria-label={`Pause ${schedule.name}`}
                disabled={pending || schedule.status !== "active"}
                disabledReason="Only an active schedule can pause"
                onClick={() =>
                  onAction(() => scheduleAction(api, schedule.id, "pause", schedule.version))
                }
              >
                Pause
              </Button>
            )}
            <Button
              variant="quiet"
              size="small"
              aria-label={`Delete ${schedule.name}`}
              disabled={pending || !deletable}
              disabledReason="Cancel the schedule first; a completed or canceled one can be deleted"
              onClick={() => onConfirm("delete")}
            >
              Delete
            </Button>
          </>
        ) : undefined
      }
    />
  );
}

// The picked schedule: its policy, topic generation and run history, with Cancel for a live
// one (rare, so here rather than on every row).
function ScheduleDetail({
  schedule,
  pending,
  onAction,
  onConfirm,
}: {
  readonly schedule: ScheduleSummary;
  readonly pending: boolean;
  readonly onAction: Act;
  readonly onConfirm: (kind: "cancel" | "delete") => void;
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
