import type { ChannelVideo } from "@app/slices/channels/videos.js";
import type { EpisodeMemory } from "@app/slices/episodes/repo.js";
import { queryOptions } from "@tanstack/react-query";
import type { Api } from "@/api";
import { read } from "@/http";

export type { ChannelVideo, EpisodeMemory };

// Channel page → Episodes (episode memory) and Existing videos.
export interface ChannelEpisodes {
  readonly enabled: boolean;
  readonly memories: readonly EpisodeMemory[];
}

export const episodesKey = (channelId: string) => ["channels", channelId, "episodes"] as const;
export const videosKey = (channelId: string) => ["channels", channelId, "videos"] as const;
const root = (api: Api, channelId: string): string => `${api.origin}/api/channels/${channelId}`;
const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

export function episodesQuery(api: Api, channelId: string) {
  return queryOptions({
    queryKey: episodesKey(channelId),
    queryFn: async () => read<ChannelEpisodes>(await api.fetch(`${root(api, channelId)}/episodes`)),
  });
}

export async function setEpisodeMemory(
  api: Api,
  channelId: string,
  enabled: boolean,
): Promise<ChannelEpisodes> {
  return read(
    await api.fetch(`${root(api, channelId)}/episodes/setting`, json("PUT", { enabled })),
  );
}

export async function saveEpisodeSummary(
  api: Api,
  channelId: string,
  memoryId: string,
  summary: string,
): Promise<EpisodeMemory> {
  return read(
    await api.fetch(
      `${root(api, channelId)}/episodes/${encodeURIComponent(memoryId)}`,
      json("PUT", { summary }),
    ),
  );
}

export async function deleteEpisodeMemory(
  api: Api,
  channelId: string,
  memoryId: string,
): Promise<void> {
  const response = await api.fetch(
    `${root(api, channelId)}/episodes/${encodeURIComponent(memoryId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) await read(response);
}

export function videosQuery(api: Api, channelId: string) {
  return queryOptions({
    queryKey: videosKey(channelId),
    queryFn: async () =>
      (
        await read<{ readonly videos: readonly ChannelVideo[] }>(
          await api.fetch(`${root(api, channelId)}/videos`),
        )
      ).videos,
  });
}

// `filter` is the preview's "Keep only titles containing…" text, remembered for the channel.
export async function importVideos(
  api: Api,
  channelId: string,
  body: {
    readonly format: "lines" | "csv";
    readonly text: string;
    readonly filter?: string;
  },
): Promise<{ readonly added: number; readonly skipped: number }> {
  return read(await api.fetch(`${root(api, channelId)}/videos`, json("POST", body)));
}

// The titles in a Studio CSV, to tick before saving; nothing is saved yet.
export async function previewVideos(
  api: Api,
  channelId: string,
  text: string,
): Promise<{ readonly titles: readonly string[]; readonly filter: string }> {
  return read(
    await api.fetch(
      `${root(api, channelId)}/videos/preview`,
      json("POST", { format: "csv", text }),
    ),
  );
}

export async function deleteVideo(api: Api, channelId: string, videoId: string): Promise<void> {
  const response = await api.fetch(`${root(api, channelId)}/videos/${videoId}`, {
    method: "DELETE",
  });
  if (!response.ok) await read(response);
}

export async function clearVideos(api: Api, channelId: string): Promise<void> {
  await read(await api.fetch(`${root(api, channelId)}/videos`, { method: "DELETE" }));
}
