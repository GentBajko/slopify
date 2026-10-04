import type { VideoStats } from "@app/slices/studio/stats.js";
import type { YoutubeVideo } from "@app/slices/studio/videos.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useState } from "react";
import { readProjectStats, readProjectVideos, saveProjectVideo } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { shortDate } from "@/lib/utils";

// On YouTube: the video each of the project's uploads became (the long video and each short),
// as the Slopify Studio extension read it from Studio's upload dialog or as pasted here. A/B
// test opens the video in Studio, where the extension sets up A/B Testing for the titles, the
// thumbnails or both; you check it and press Set test and Save (`slices/studio/videos.ts`).

export type AbMode = "titles" | "thumbnails" | "both";

// The Studio page the extension sets the A/B test up on.
export function abTestUrl(
  videoId: string,
  mode: AbMode,
  projectId: string,
  short: number | null,
): string {
  return `https://studio.youtube.com/video/${videoId}/edit#slopify-ab=${mode}&p=${encodeURIComponent(projectId)}&s=${String(short ?? 0)}`;
}

const videosKey = (projectId: string) => ["project", projectId, "youtube-videos"] as const;

// The project's YouTube videos, shared by On YouTube and the Shorts part.
export function useProjectVideos(projectId: string) {
  const { api } = useApp();
  return useQuery({
    queryKey: videosKey(projectId),
    queryFn: () => readProjectVideos(api, projectId),
  });
}

// The long video's link once it is on YouTube, for the shorts' "Watch the full video" line.
export function knownVideoLink(videos: readonly YoutubeVideo[] | undefined): string | undefined {
  const own = videos?.find((one) => one.short === null && one.uploadState === "done");
  return own === undefined ? undefined : `https://youtu.be/${own.videoId}`;
}

function uploadName(short: number | null): string {
  return short === null ? "Video" : `Short ${String(short)}`;
}

function stateWords(video: YoutubeVideo): string {
  if (video.uploadState === "filled")
    return "Filled in Studio, but not scheduled or published yet (canceled, or left as a draft). Upload it again from the extension, or paste its link once it is up.";
  const parts = ["On YouTube."];
  if (video.finishState === "waiting")
    parts.push("Related video, end screen and captions are being set.");
  if (video.finishState === "failed")
    parts.push(`Details touches failed: ${video.finishMessage ?? "no reason given"}`);
  if (video.commentState === "waiting") parts.push("The comment is pinned once it is public.");
  if (video.commentState === "done") parts.push("Comment pinned.");
  if (video.commentState === "failed")
    parts.push(`Pinning the comment failed: ${video.commentMessage ?? "no reason given"}`);
  return parts.join(" ");
}

export function OnYoutube({
  projectId,
  shorts,
}: {
  readonly projectId: string;
  // How many shorts the project has, each a row of its own.
  readonly shorts: number;
}): ReactElement {
  const videos = useProjectVideos(projectId);
  const { api } = useApp();
  // Studio's numbers, as the extension last read them from each video's Analytics.
  const stats = useQuery({
    queryKey: ["project", projectId, "youtube-stats"],
    queryFn: () => readProjectStats(api, projectId),
  });
  const uploads: readonly (number | null)[] = [
    null,
    ...Array.from({ length: shorts }, (_, index) => index + 1),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="sl-field__label">On YouTube</div>
      <p className="m-0 text-small text-ink-3">
        The extension keeps each upload's link when Studio confirms it. Paste a link for an upload
        made by hand. A/B test opens the video in Studio with A/B Testing set up; press Set test and
        Save there.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {uploads.map((short) => (
          <UploadRow
            key={short ?? 0}
            projectId={projectId}
            short={short}
            video={videos.data?.find((one) => one.short === short)}
            stats={stats.data?.find((one) => one.short === short)}
          />
        ))}
      </ul>
    </div>
  );
}

function UploadRow({
  projectId,
  short,
  video,
  stats,
}: {
  readonly projectId: string;
  readonly short: number | null;
  readonly video: YoutubeVideo | undefined;
  readonly stats: VideoStats | undefined;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const id = useId();
  const saved = video === undefined ? "" : `https://youtu.be/${video.videoId}`;
  const [value, setValue] = useState<string | undefined>();
  const shown = value ?? saved;
  const [error, setError] = useState<string | undefined>();
  const done = (next: readonly YoutubeVideo[]) => {
    client.setQueryData(videosKey(projectId), next);
    setValue(undefined);
    setError(undefined);
  };
  const save = useMutation({
    mutationFn: () => saveProjectVideo(api, projectId, short, shown),
    onSuccess: done,
    onError: (failure: Error) => setError(failure.message),
  });
  // Deleted in Studio: Slopify forgets the video, so the upload can be made again.
  const forget = useMutation({
    mutationFn: () => saveProjectVideo(api, projectId, short, ""),
    onSuccess: done,
    onError: (failure: Error) =>
      setError(`${failure.message} Press Deleted on YouTube again, or clear the link and save.`),
  });

  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="w-[64px] shrink-0 text-small text-ink-2" htmlFor={id}>
          {uploadName(short)}
        </label>
        <Input
          id={id}
          type="url"
          className="min-w-[220px] flex-1 sm:max-w-[360px]"
          placeholder="https://youtu.be/…"
          value={shown}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        {shown.trim() === saved ? null : (
          <Button
            type="button"
            size="small"
            disabled={save.isPending}
            onClick={() => save.mutate()}
          >
            Save link
          </Button>
        )}
        {video === undefined || shown.trim() !== saved ? null : (
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={forget.isPending}
            onClick={() => forget.mutate()}
          >
            Deleted on YouTube
          </Button>
        )}
        {video === undefined || video.uploadState !== "done" || short !== null ? null : (
          <Menu>
            <MenuTrigger asChild>
              <Button type="button" size="small" variant="quiet">
                A/B test
              </Button>
            </MenuTrigger>
            <MenuContent>
              {(
                [
                  ["both", "Titles and thumbnails"],
                  ["titles", "Titles"],
                  ["thumbnails", "Thumbnails"],
                ] as const
              ).map(([mode, label]) => (
                <MenuItem
                  key={mode}
                  onSelect={() =>
                    window.open(
                      abTestUrl(video.videoId, mode, projectId, short),
                      "_blank",
                      "noopener",
                    )
                  }
                >
                  {label}
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
        )}
      </div>
      {video === undefined && error === undefined ? null : (
        <p
          className={`m-0 pl-18 text-small ${error !== undefined || video?.finishState === "failed" || video?.commentState === "failed" ? "text-danger" : "text-ink-3"}`}
        >
          {error ?? (video === undefined ? "" : stateWords(video))}
        </p>
      )}
      {stats === undefined ? null : (
        <p className="m-0 pl-18 text-small tabular-nums text-ink-2">{numbersOf(stats)}</p>
      )}
    </li>
  );
}

// "66 views · 2.2% CTR of 493 impressions · 32:19 average view · read 2 Oct".
function numbersOf(stats: VideoStats): string {
  const parts: string[] = [];
  if (stats.views !== null) parts.push(`${stats.views.toLocaleString()} views`);
  if (stats.ctr !== null)
    parts.push(
      `${String(stats.ctr)}% CTR${stats.impressions === null ? "" : ` of ${stats.impressions.toLocaleString()} impressions`}`,
    );
  if (stats.averageViewSeconds !== null) {
    const s = Math.round(stats.averageViewSeconds);
    const clock =
      s >= 3600
        ? `${String(Math.floor(s / 3600))}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
        : `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`;
    parts.push(`${clock} average view`);
  }
  parts.push(`read ${shortDate(stats.readAt)}`);
  return parts.join(" · ");
}
