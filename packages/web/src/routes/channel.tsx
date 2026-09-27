import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { useApp } from "@/app-context";
import { AiDisclosureSettingField } from "@/channels/ai-disclosure";
import { channelQuery, channelsKey, deleteChannel } from "@/channels/api";
import { BrandTab } from "@/channels/brand-tab";
import { CastTab } from "@/channels/cast-tab";
import { EpisodesTab } from "@/channels/episodes-tab";
import { SchedulesTab, TemplatesTab } from "@/channels/members-tabs";
import { VideosTab } from "@/channels/videos-tab";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { PageHeader } from "@/components/kit/layout";
import { TabPanel, Tabs } from "@/components/kit/tabs";

export const channelTabs = [
  "brand",
  "cast",
  "templates",
  "schedules",
  "episodes",
  "videos",
] as const;
export type ChannelTab = (typeof channelTabs)[number];
const labels: Readonly<Record<ChannelTab, string>> = {
  brand: "Brand",
  cast: "Cast",
  templates: "Templates",
  schedules: "Schedules",
  episodes: "Episodes",
  videos: "Existing videos",
};

export function channelTabOf(value: unknown): ChannelTab {
  return channelTabs.find((tab) => tab === value) ?? "brand";
}

// One channel: its brand kit and series brief, its cast, and the templates and schedules that
// belong to it, its episode memory and its existing videos, as tabs under the page header.
// The header carries the current tab's primary action (Add to cast on Cast; the brand kit
// saves from its own action bar).
export function ChannelRoute({
  channelId,
  tab,
  onTab,
}: {
  readonly channelId: string;
  readonly tab: ChannelTab;
  readonly onTab: (tab: ChannelTab) => void;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const read = useQuery(channelQuery(api, channelId));
  const [deleting, setDeleting] = useState(false);
  // The cast member shown in the editor beside the cast: "new" while adding one.
  const [castSelected, setCastSelected] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: () => deleteChannel(api, channelId),
    onSuccess: async () => {
      setDeleting(false);
      await client.invalidateQueries({ queryKey: channelsKey });
      await navigate({ to: "/channels" });
    },
  });
  const channel = read.data?.channel;
  const cast = read.data?.cast ?? [];
  const addToCast = () => {
    onTab("cast");
    setCastSelected("new");
  };
  useCommand({
    id: "channel.add-to-cast",
    title: "Add to cast",
    group: "Channel",
    ...(channel === undefined ? {} : { context: channel.name }),
    keywords: ["character", "creature", "place", "object"],
    run: addToCast,
  });
  return (
    <div>
      <PageHeader
        crumb={<Link to="/channels">Channels</Link>}
        title={channel?.name ?? "Channel"}
        meta={channel?.isDefault ? "Default channel" : undefined}
        actions={
          <>
            {tab === "cast" && channel ? (
              <Button variant="primary" onClick={addToCast}>
                <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Add to cast
              </Button>
            ) : null}
            {channel && !channel.isDefault ? (
              <Button
                variant="quiet"
                onClick={() => {
                  remove.reset();
                  setDeleting(true);
                }}
              >
                Delete channel
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs
        items={channelTabs.map((id) => ({
          id,
          label: labels[id],
          ...(id === "cast" ? { badge: String(cast.length) } : {}),
        }))}
        value={tab}
        onChange={onTab}
        label="Channel sections"
        idPrefix="channel"
        className="mb-6"
      />
      <StatusSlot tone={read.error ? "error" : "info"} className="mb-2">
        {read.error
          ? `The channel couldn't be loaded: ${read.error.message} Go back to Channels and open it again.`
          : read.isPending
            ? "Loading the channel…"
            : undefined}
      </StatusSlot>
      {channel ? (
        <>
          <TabPanel idPrefix="channel" id="brand" active={tab === "brand"}>
            <AiDisclosureSettingField channel={channel} />
            <BrandTab key={`${channel.id}:${String(channel.version)}`} channel={channel} />
          </TabPanel>
          <TabPanel idPrefix="channel" id="cast" active={tab === "cast"}>
            <CastTab
              channelId={channel.id}
              cast={cast}
              selected={castSelected}
              onSelect={setCastSelected}
            />
          </TabPanel>
          <TabPanel idPrefix="channel" id="templates" active={tab === "templates"}>
            {tab === "templates" ? <TemplatesTab channelId={channel.id} /> : null}
          </TabPanel>
          <TabPanel idPrefix="channel" id="schedules" active={tab === "schedules"}>
            {tab === "schedules" ? <SchedulesTab channelId={channel.id} /> : null}
          </TabPanel>
          <TabPanel idPrefix="channel" id="episodes" active={tab === "episodes"}>
            {tab === "episodes" ? <EpisodesTab channelId={channel.id} /> : null}
          </TabPanel>
          <TabPanel idPrefix="channel" id="videos" active={tab === "videos"}>
            {tab === "videos" ? <VideosTab channelId={channel.id} /> : null}
          </TabPanel>
        </>
      ) : null}
      <ConfirmDialog
        open={deleting}
        title={`Delete ${channel?.name ?? "this channel"}?`}
        consequence={
          remove.error?.message ??
          "Its cast goes with it. Its videos move to the default channel and keep what they were made with."
        }
        confirmLabel="Delete channel"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
