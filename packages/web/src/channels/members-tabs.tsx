import type { ScheduleSummary } from "@app/slices/schedules/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { EmptyState } from "@/components/kit/empty-state";
import { HelpLine, Select } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { ButtonLink, TextLink } from "@/components/kit/link";
import { List, ListRow } from "@/components/kit/list-row";
import { Status } from "@/components/kit/status";
import { scheduleStatusLook } from "@/lib/state-words";
import { shortDate } from "@/lib/utils";
import { schedulesQuery } from "@/schedules/api";
import { requestNewSchedule } from "@/schedules/new-from";
import { formatScheduleDate } from "@/schedules/time";
import { type TemplateSummary, templatesKey, templatesQuery } from "@/templates/api";
import { channelsKey, channelsQuery, defaultChannelId, moveTemplate } from "./api";

// A template with no channel (from an older server) is the default channel's.
export function channelOfTemplate(template: { readonly channelId?: string | undefined }): string {
  return template.channelId ?? defaultChannelId;
}

// New schedule from a channel's page: the calendar's Schedules tab, on its form.
// "row" is the small one among a template row's buttons, whose form starts on that template.
function NewScheduleLink({
  variant = "secondary",
  template,
}: {
  readonly variant?: "primary" | "secondary" | "row";
  readonly template?: TemplateSummary;
}): ReactElement {
  return (
    <ButtonLink
      to="/calendar"
      search={{ tab: "schedules" }}
      variant={variant === "row" ? "secondary" : variant}
      size={variant === "row" ? "small" : "default"}
      {...(template === undefined ? {} : { "aria-label": `New schedule from ${template.name}` })}
      onClick={() => requestNewSchedule(template?.id)}
    >
      {variant === "row" ? null : <PlusIcon aria-hidden="true" strokeWidth={1.75} />}
      New schedule
    </ButtonLink>
  );
}

// "Saved Sep 27"; nothing for a date the server did not send in full.
function savedOn(iso: string): string | undefined {
  return Number.isNaN(Date.parse(iso)) ? undefined : `Saved ${shortDate(iso)}`;
}

// "Runs on Lore, next Oct 25" for a template's live schedules; "No schedule" without one.
function schedulesLine(schedules: readonly ScheduleSummary[]): string {
  if (schedules.length === 0) return "No schedule";
  const named = schedules
    .map((one) =>
      one.nextRunAt === null
        ? one.name
        : `${one.name}, next ${formatScheduleDate(one.nextRunAt, one.timezone)}`,
    )
    .join("; ");
  return `Runs on ${named}`;
}

// The Templates tab: what this channel can make. Each template opens its editor by its name,
// makes a video from it, starts a schedule, and (with another channel to go to) moves to it
// with its schedules.
export function TemplatesTab({
  channelId,
  onMake,
}: {
  readonly channelId: string;
  // Create, opened on a fresh draft of the template; absent outside the shell.
  readonly onMake: ((template: TemplateSummary) => Promise<void>) | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const templates = useQuery(templatesQuery(api));
  const channels = useQuery(channelsQuery(api));
  const schedules = useQuery(schedulesQuery(api));
  const [problem, setProblem] = useState<string | undefined>();
  const [making, setMaking] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: (input: { readonly templateId: string; readonly channelId: string }) =>
      moveTemplate(api, input.templateId, input.channelId),
    onSettled: () =>
      Promise.all([
        client.invalidateQueries({ queryKey: templatesKey }),
        client.invalidateQueries({ queryKey: channelsKey }),
      ]),
  });
  const own = (templates.data ?? []).filter(
    (template) => channelOfTemplate(template) === channelId,
  );
  const others = (channels.data ?? []).filter((channel) => channel.id !== channelId);
  const make = async (template: TemplateSummary) => {
    if (onMake === undefined) return;
    setProblem(undefined);
    setMaking(template.id);
    try {
      await onMake(template);
    } catch (error) {
      setProblem(
        `${template.name} didn't open in Create: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setMaking(null);
    }
  };
  return (
    <div {...helpScope} className="flex flex-col gap-3">
      {templates.data && own.length === 0 ? (
        <EmptyState title="No templates in this channel">
          A template is a saved setup for one kind of video. Press Make a video, then choose Save as
          template{others.length === 0 ? "" : ", or move one here from another channel"}.
        </EmptyState>
      ) : null}
      {own.length > 0 ? (
        <List label="Channel templates" className="sl-list--wrap-actions">
          {own.map((template) => {
            const running = (schedules.data ?? []).filter(
              (one) => one.deletedAt === null && one.templateId === template.id,
            );
            return (
              <ListRow
                key={template.id}
                title={
                  <Link to="/templates/$templateId" params={{ templateId: template.id }}>
                    {template.name}
                  </Link>
                }
                meta={[savedOn(template.updatedAt), schedulesLine(running)]
                  .filter((part) => part !== undefined)
                  .join(" · ")}
                actions={
                  <>
                    {onMake === undefined ? null : (
                      <Button
                        size="small"
                        aria-label={`Make a video from ${template.name}`}
                        disabled={making !== null}
                        disabledReason="Opening Create…"
                        onClick={() => void make(template)}
                      >
                        {making === template.id ? "Opening…" : "Make a video"}
                      </Button>
                    )}
                    <NewScheduleLink variant="row" template={template} />
                    {others.length === 0 ? null : (
                      <Select
                        aria-label={`Move ${template.name} to`}
                        className="sl-select--compact"
                        value=""
                        disabled={move.isPending}
                        onChange={(event) => {
                          const target = event.target.value;
                          if (target !== "")
                            move.mutate({ templateId: template.id, channelId: target });
                        }}
                        options={[
                          { value: "", label: "Move to…" },
                          ...others.map((channel) => ({ value: channel.id, label: channel.name })),
                        ]}
                      />
                    )}
                  </>
                }
              />
            );
          })}
        </List>
      ) : null}
      {own.length > 0 && others.length > 0 ? (
        <HelpLine>
          Move to sends a template and its schedules to another channel; their next videos take that
          channel's look and cast.
        </HelpLine>
      ) : null}
      {/* Last, so while it is empty it adds no gap above the list. */}
      <StatusSlot tone="error">
        {problem ?? move.error?.message ?? templates.error?.message}
      </StatusSlot>
    </div>
  );
}

// The Schedules tab: the schedules that run this channel's templates, with when each runs
// next, and New schedule. They are edited on the calendar's Schedules tab.
export function SchedulesTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const templates = useQuery(templatesQuery(api));
  const schedules = useQuery(schedulesQuery(api));
  const inChannel = new Set(
    (templates.data ?? [])
      .filter((template) => channelOfTemplate(template) === channelId)
      .map((template) => template.id),
  );
  const own = (schedules.data ?? []).filter(
    (schedule) => schedule.deletedAt === null && inChannel.has(schedule.templateId),
  );
  return (
    <div className="flex flex-col gap-3">
      {schedules.data && own.length === 0 ? (
        <EmptyState
          title="No schedules for this channel yet"
          actions={inChannel.size === 0 ? undefined : <NewScheduleLink variant="primary" />}
        >
          {inChannel.size === 0
            ? "A schedule makes a new video from one of this channel's templates at a time you pick. Save a template first."
            : "A schedule makes a new video from one of this channel's templates at a time you pick, once or every week."}
        </EmptyState>
      ) : null}
      {own.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="m-0 text-small text-ink-2">
              Each one makes a video from this channel's templates at its times.
            </p>
            <NewScheduleLink variant="primary" />
          </div>
          <List label="Channel schedules">
            {own.map((schedule) => (
              <ListRow
                key={schedule.id}
                title={
                  <TextLink to="/calendar" search={{ tab: "schedules", schedule: schedule.id }}>
                    {schedule.name}
                  </TextLink>
                }
                meta={`${
                  schedule.nextRunAt === null
                    ? "No next video"
                    : `Next video ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}`
                } · ${String(schedule.items.length)} ${schedule.items.length === 1 ? "topic" : "topics"} queued`}
                actions={
                  <Status tone={scheduleStatusLook[schedule.status].tone}>
                    {scheduleStatusLook[schedule.status].word}
                  </Status>
                }
              />
            ))}
          </List>
        </>
      ) : null}
      <StatusSlot tone="error">{schedules.error?.message}</StatusSlot>
    </div>
  );
}
