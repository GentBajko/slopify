import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { EmptyState } from "@/components/kit/empty-state";
import { Select } from "@/components/kit/field";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { List, ListRow } from "@/components/kit/list-row";
import { Status, type Tone } from "@/components/kit/status";
import { schedulesQuery } from "@/schedules/api";
import { formatScheduleDate } from "@/schedules/time";
import { templatesKey, templatesQuery } from "@/templates/api";
import { channelsKey, channelsQuery, defaultChannelId, moveTemplate } from "./api";

// A template with no channel (from an older server) is the default channel's.
export function channelOfTemplate(template: { readonly channelId?: string | undefined }): string {
  return template.channelId ?? defaultChannelId;
}

// The Templates tab: the channel's templates, each with the channel it can be moved to. Its
// schedules move with it.
export function TemplatesTab({ channelId }: { readonly channelId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const templates = useQuery(templatesQuery(api));
  const channels = useQuery(channelsQuery(api));
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
  return (
    <div {...helpScope}>
      <p className="m-0 mb-4 max-w-[68ch] text-small text-ink-2">
        Runs from these templates use this channel's brand kit and cast. Save new ones from Play in{" "}
        <Link to="/templates" className="underline">
          Library → Templates
        </Link>
        . Move to sends a template and its schedules to another channel.{" "}
        <InfoTip id="planning.channel.template-move" className="-my-1 align-middle" />
      </p>
      <StatusSlot tone={move.error || templates.error ? "error" : "info"} className="mb-2">
        {move.error?.message ?? templates.error?.message}
      </StatusSlot>
      {templates.data && own.length === 0 ? (
        <EmptyState title="No templates in this channel">
          Pick this channel on Play, then save the setup as a template, or move one here from
          another channel.
        </EmptyState>
      ) : null}
      {own.length > 0 ? (
        <List label="Channel templates" className="[&_.sl-row__actions]:flex-wrap">
          {own.map((template) => (
            <ListRow
              key={template.id}
              title={template.name}
              meta={`Version ${String(template.version)}`}
              actions={
                <span className="flex items-center gap-2 text-small text-ink-2">
                  Move to
                  <Select
                    aria-label={`Channel of ${template.name}`}
                    value={channelId}
                    disabled={move.isPending}
                    onChange={(event) =>
                      move.mutate({ templateId: template.id, channelId: event.target.value })
                    }
                    options={(channels.data ?? []).map((channel) => ({
                      value: channel.id,
                      label: channel.name,
                    }))}
                  />
                </span>
              }
            />
          ))}
        </List>
      ) : null}
    </div>
  );
}

const statusLabels = {
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  canceled: "Canceled",
} as const;
const statusTones: Readonly<Record<keyof typeof statusLabels, Tone>> = {
  active: "running",
  paused: "waiting",
  completed: "done",
  canceled: "off",
};

// The Schedules tab: the schedules that run this channel's templates. They are managed in
// Calendar → Schedules.
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
    <div>
      <p className="m-0 mb-4 max-w-[68ch] text-small text-ink-2">
        A schedule belongs to the channel of the template it runs. Create and change schedules in{" "}
        <Link to="/schedules" className="underline">
          Calendar → Schedules
        </Link>
        .
      </p>
      <StatusSlot tone={schedules.error ? "error" : "info"} className="mb-2">
        {schedules.error?.message}
      </StatusSlot>
      {schedules.data && own.length === 0 ? (
        <EmptyState title="No schedules run this channel's templates">
          Make one in Calendar → Schedules from one of this channel's templates.
        </EmptyState>
      ) : null}
      {own.length > 0 ? (
        <List label="Channel schedules">
          {own.map((schedule) => (
            <ListRow
              key={schedule.id}
              title={schedule.name}
              meta={
                <>
                  <Status tone={statusTones[schedule.status]}>
                    {statusLabels[schedule.status]}
                  </Status>
                  {` · ${
                    schedule.nextRunAt === null
                      ? "No next run"
                      : `Next run ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}`
                  } · ${String(schedule.items.length)} queued`}
                </>
              }
            />
          ))}
        </List>
      ) : null}
    </div>
  );
}
