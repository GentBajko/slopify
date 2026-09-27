import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useApp } from "@/app-context";
import { StatusSlot } from "@/components/kit/action-bar";
import { RailGroup } from "@/components/rail";
import { Picker } from "@/components/ui/picker";
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
    <div>
      <p className="mb-3 text-small text-ink2">
        Runs from these templates use this channel's brand kit and cast. Save new ones from Play in{" "}
        <Link to="/templates" className="underline">
          Library → Templates
        </Link>
        .
      </p>
      <StatusSlot tone={move.error || templates.error ? "error" : "info"} className="mb-2">
        {move.error?.message ?? templates.error?.message}
      </StatusSlot>
      {templates.data && own.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">
            No templates in this channel. Pick this channel on Play, then save the setup as a
            template, or move one here from another channel.
          </p>
        </RailGroup>
      ) : null}
      {own.length > 0 ? (
        <ul
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Channel templates"
        >
          {own.map((template) => (
            <li
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-4 py-[10px] last:border-b-0"
            >
              <div className="min-w-0">
                <h3 className="break-words font-semibold">{template.name}</h3>
                <p className="text-small text-ink3">Version {template.version}</p>
              </div>
              <div className="flex items-center gap-2 text-small text-ink2">
                Move to
                <Picker
                  aria-label={`Channel of ${template.name}`}
                  value={channelId}
                  disabled={move.isPending}
                  onChange={(event) =>
                    move.mutate({ templateId: template.id, channelId: event.target.value })
                  }
                >
                  {(channels.data ?? []).map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </Picker>
              </div>
            </li>
          ))}
        </ul>
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

// The Schedules tab: the schedules that run this channel's templates. They are managed in
// Library → Schedules.
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
      <p className="mb-3 text-small text-ink2">
        A schedule belongs to the channel of the template it runs. Create and change schedules in{" "}
        <Link to="/schedules" className="underline">
          Library → Schedules
        </Link>
        .
      </p>
      <StatusSlot tone={schedules.error ? "error" : "info"} className="mb-2">
        {schedules.error?.message}
      </StatusSlot>
      {schedules.data && own.length === 0 ? (
        <RailGroup>
          <p className="px-4 py-6 text-ink2">No schedules run this channel's templates.</p>
        </RailGroup>
      ) : null}
      {own.length > 0 ? (
        <ul
          className="overflow-hidden rounded-panel border border-line bg-panel"
          aria-label="Channel schedules"
        >
          {own.map((schedule) => (
            <li
              key={schedule.id}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-line px-4 py-[10px] last:border-b-0"
            >
              <h3 className="break-words font-semibold">{schedule.name}</h3>
              <p className="text-small text-ink3">
                {statusLabels[schedule.status]} ·{" "}
                {schedule.nextRunAt === null
                  ? "No next run"
                  : `Next run ${formatScheduleDate(schedule.nextRunAt, schedule.timezone)}`}{" "}
                · {schedule.items.length} queued
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
