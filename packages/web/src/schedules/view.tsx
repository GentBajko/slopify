import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { calendarMaxDays } from "@app/slices/schedules/schema.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import { useApp } from "@/app-context";
import { channelsQuery, defaultChannelId } from "@/channels/api";
import { useCurrentChannel } from "@/channels/current";
import { channelOfTemplate } from "@/channels/members-tabs";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { InfoTip } from "@/components/kit/info-tip";
import { ListDetail } from "@/components/kit/layout";
import { SectionHead } from "@/components/kit/section-head";
import { useToast } from "@/components/kit/toast";
import { intents, useIntent } from "@/lib/intents";
import {
  calendarQuery,
  deleteSchedule,
  scheduleAction,
  schedulesKey,
  schedulesQuery,
} from "@/schedules/api";
import { ScheduleForm } from "@/schedules/form";
import { templatesQuery } from "@/templates/api";
import { duplicateSchedule } from "./duplicate";
import {
  arrangeSchedules,
  listToolsFrom,
  ScheduleListTools,
  type ScheduleSort,
} from "./list-tools";
import { ScheduleDetail } from "./schedule-detail";
import { ScheduleList } from "./schedule-list";
import type { Act, Reply } from "./schedule-row";

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
  const sidebarChannel = useCurrentChannel().channelId;
  // Starts on the channel the sidebar shows, then is this list's own choice. "" shows every channel's schedules; a schedule's channel is its template's.
  const [channelFilter, setChannelFilter] = useState(sidebarChannel ?? "");
  const inChannel = (schedule: ScheduleSummary): boolean => {
    if (channelFilter === "") return true;
    const template = templates.data?.find((one) => one.id === schedule.templateId);
    return (template ? channelOfTemplate(template) : defaultChannelId) === channelFilter;
  };
  // Search and sort appear once there are several schedules to look through.
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ScheduleSort>("newest");
  const allLive = schedules.data?.filter((schedule) => schedule.deletedAt === null) ?? [];
  const listTools = allLive.length >= listToolsFrom;
  const channelSchedules = allLive.filter(inChannel);
  const liveSchedules = listTools
    ? arrangeSchedules(channelSchedules, query, sort)
    : channelSchedules;
  const deletedSchedules = schedules.data?.filter((schedule) => schedule.deletedAt !== null) ?? [];
  // A link naming a schedule that no longer exists says so rather than showing another one.
  const missing =
    picked !== null &&
    schedules.data !== undefined &&
    !schedules.data.some((schedule) => schedule.id === picked);
  // The detail shows the picked schedule, else the first live one.
  const selected = missing
    ? null
    : (schedules.data?.find((schedule) => schedule.id === picked) ?? liveSchedules[0] ?? null);
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
  const duplicate = (schedule: ScheduleSummary) =>
    act(async () => {
      const reply = await duplicateSchedule(
        api,
        schedule,
        (schedules.data ?? []).map((one) => one.name),
      );
      if (reply.ok) {
        const copy = reply.value;
        await queryClient.invalidateQueries({ queryKey: schedulesKey });
        setPicked(copy.id);
        notify(
          `Duplicated as “${copy.name}”: paused, with an empty topic queue. Press Edit to change it, then Resume.`,
          "success",
          { label: "Edit", run: () => edit(copy) },
        );
      }
      return reply;
    });
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
          <ScheduleList
            tools={
              listTools ? (
                <ScheduleListTools query={query} sort={sort} onQuery={setQuery} onSort={setSort} />
              ) : null
            }
            loaded={schedules.data !== undefined}
            live={liveSchedules}
            hiddenBySearch={listTools ? channelSchedules.length - liveSchedules.length : 0}
            channelFiltered={channelFilter !== ""}
            deleted={deletedSchedules}
            selectedId={formOpen ? undefined : selected?.id}
            pending={rowPending}
            nextTitles={nextTitles}
            onPick={setPicked}
            onEdit={edit}
            onAction={act}
            onConfirm={(kind, schedule) => setConfirm({ kind, schedule })}
          />
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
          ) : missing ? (
            <EmptyState title="This schedule wasn't found">
              The link names a schedule that is no longer here: a deleted schedule leaves Settings →
              Trash after 30 days. Pick one from the list, or press New schedule.
            </EmptyState>
          ) : selected ? (
            <ScheduleDetail
              key={selected.id}
              schedule={selected}
              pending={rowPending}
              onAction={act}
              onConfirm={(kind) => setConfirm({ kind, schedule: selected })}
              onDuplicate={() => duplicate(selected)}
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
