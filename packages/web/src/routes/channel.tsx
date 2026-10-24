import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { readAbResults } from "@/api";
import { useApp } from "@/app-context";
import { channelQuery, channelsKey, channelsQuery, deleteChannel } from "@/channels/api";
import { BrandTab } from "@/channels/brand-tab";
import { CastTab } from "@/channels/cast-tab";
import { channelDeleteConsequence, channelDeleteTitle } from "@/channels/delete-copy";
import { EpisodesTab } from "@/channels/episodes-tab";
import { useMakeVideo } from "@/channels/make-video";
import { SchedulesTab, TemplatesTab } from "@/channels/members-tabs";
import { ProjectsTab } from "@/channels/projects-tab";
import { VideosTab } from "@/channels/videos-tab";
import { useDocumentTitle } from "@/components/document-title";
import { StatusSlot } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { EmptyState } from "@/components/kit/empty-state";
import { PageHeader } from "@/components/kit/layout";
import { ButtonLink } from "@/components/kit/link";
import { TabPanel, Tabs } from "@/components/kit/tabs";
import { projectsQuery } from "@/queries";

// The tab ids stay as they were, so old addresses keep opening the same data; the words are
// what a stranger would call each part of a channel.
export const channelTabs = [
  "brand",
  "cast",
  "projects",
  "templates",
  "schedules",
  "episodes",
  "videos",
] as const;
export type ChannelTab = (typeof channelTabs)[number];
const labels: Readonly<Record<ChannelTab, string>> = {
  brand: "Name and look",
  cast: "Cast",
  projects: "Projects",
  templates: "Templates",
  schedules: "Schedules",
  episodes: "Memory",
  videos: "Titles to avoid",
};

export function channelTabOf(value: unknown): ChannelTab {
  return channelTabs.find((tab) => tab === value) ?? "brand";
}

// One channel: its name, series brief and look; its cast; what it made; the templates and
// schedules that belong to it; what it remembers of each video; and the titles new topics
// avoid, as tabs under the page header. The header's primary is Make a video (Add to cast on
// the Cast tab), with What worked on YouTube once a test of its videos was read. With one
// channel, /channels is this page with New channel beside it (`routes/channels.tsx`):
// `crumb` is off and `actions` adds the button.
export function ChannelRoute({
  channelId,
  tab,
  onTab,
  crumb = true,
  actions,
}: {
  readonly channelId: string;
  readonly tab: ChannelTab;
  readonly onTab: (tab: ChannelTab) => void;
  readonly crumb?: boolean;
  readonly actions?: ReactNode;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const navigate = useNavigate();
  const read = useQuery(channelQuery(api, channelId));
  // With one channel, Channels is this very page, so there is no crumb back to it.
  const channels = useQuery(channelsQuery(api));
  const showCrumb = crumb && (channels.data?.length ?? 2) > 1;
  const projects = useQuery(projectsQuery(api));
  const tests = useQuery({
    queryKey: ["studio", "ab-results"],
    queryFn: () => readAbResults(api),
  });
  const make = useMakeVideo(channelId);
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
  useDocumentTitle(channel === undefined ? undefined : `${channel.name} · ${labels[tab]}`);
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
  // YouTube's A/B results are read per video; the link shows once one of this channel's was.
  const own = new Set(
    (projects.data?.projects ?? [])
      .filter((project) => project.channelId === channelId)
      .map((project) => project.id),
  );
  const tested = (tests.data ?? []).some((result) => own.has(result.projectId));
  // A channel deleted meanwhile, or an address naming none: say so and point at the list.
  // Channels are not kept in Trash, so there is nothing to restore.
  if (read.error !== null && read.data === undefined)
    return (
      <div>
        <PageHeader crumb={<Link to="/channels">Channels</Link>} title="Channel not opened" />
        <EmptyState
          title="This channel could not be opened"
          actions={
            <>
              <ButtonLink to="/channels" variant="primary">
                Open Channels
              </ButtonLink>
              <Button
                disabled={read.isFetching}
                disabledReason="Trying again…"
                onClick={() => void read.refetch()}
              >
                Try again
              </Button>
            </>
          }
        >
          {`${read.error.message} A deleted channel is gone for good (its videos moved to the default channel). Pick a channel from Channels, or press Try again.`}
        </EmptyState>
      </div>
    );
  // Add to cast opens the empty form beside the cast; while that form is already open (always,
  // for an empty cast) its own Add to cast is the one button, so the header's goes.
  const addShown = tab === "cast" && cast.length > 0 && castSelected !== "new";
  // The tab's own next step wears the accent where it has one: Save channel on Name and look
  // (its action bar), Add to cast on Cast, New schedule on Schedules. Elsewhere it is Make a
  // video.
  const makeIsNext = tab !== "cast" && tab !== "brand" && tab !== "schedules";
  return (
    <div>
      <PageHeader
        {...(showCrumb ? { crumb: <Link to="/channels">Channels</Link> } : {})}
        title={channel?.name ?? "Channel"}
        meta={channel?.isDefault ? "Default channel · videos with no channel land here" : undefined}
        actions={
          <>
            {tested ? (
              <ButtonLink to="/ab-results" variant="quiet">
                What worked on YouTube
              </ButtonLink>
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
            {actions}
            <ButtonLink
              to="/play"
              variant={makeIsNext ? "primary" : "secondary"}
              onClick={make.inChannel}
            >
              Make a video
            </ButtonLink>
            {addShown && channel ? (
              <Button variant="primary" onClick={addToCast}>
                <PlusIcon aria-hidden="true" className="size-4" strokeWidth={1.75} />
                Add to cast
              </Button>
            ) : null}
          </>
        }
      />
      <Tabs
        items={channelTabs.map((id) => ({
          id,
          label: labels[id],
          ...(id === "cast" && cast.length > 0 ? { badge: String(cast.length) } : {}),
        }))}
        value={tab}
        onChange={onTab}
        label="Channel sections"
        idPrefix="channel"
        className="mb-4"
      />
      <StatusSlot tone={read.error ? "error" : "info"} className="mb-2">
        {read.error
          ? `The channel couldn't be read again: ${read.error.message} What is shown may be out of date; reload the page to try again.`
          : read.isPending
            ? "Loading the channel…"
            : undefined}
      </StatusSlot>
      {channel ? (
        <>
          <TabPanel idPrefix="channel" id="brand" active={tab === "brand"}>
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
          <TabPanel idPrefix="channel" id="projects" active={tab === "projects"}>
            {tab === "projects" ? <ProjectsTab channelId={channel.id} /> : null}
          </TabPanel>
          <TabPanel idPrefix="channel" id="templates" active={tab === "templates"}>
            {tab === "templates" ? (
              <TemplatesTab channelId={channel.id} onMake={make.fromTemplate} />
            ) : null}
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
        title={channelDeleteTitle(channel?.name)}
        consequence={remove.error?.message ?? channelDeleteConsequence}
        confirmLabel="Delete channel"
        cancelLabel="Keep it"
        pending={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setDeleting(false)}
      />
    </div>
  );
}
