import type { YoutubeVideo } from "@app/slices/studio/videos.js";
import { linkKey, previousVideoLink } from "@app/slices/youtube/placeholders.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, type ReactNode, useId, useState } from "react";
import {
  type ProjectDescriptionEdits,
  readDescriptionEdits,
  readProjectVideos,
  saveProjectLinks,
  saveProjectVideo,
} from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine, Input } from "@/components/kit/field";
import { Fold } from "@/components/kit/fold";
import { helpScope } from "@/components/kit/info-tip";
import { TextLink } from "@/components/kit/link";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { shortDate } from "@/lib/utils";
import { keys, projectsQuery } from "@/queries";
import { projectReleasesKey, uploadName } from "./release-times.js";

// The YouTube section's links: the video each upload became on YouTube (the long video and
// each short), pasted here once it is up or kept by the Slopify Studio extension when Studio
// confirms the upload, and this project's Previous episode. The long video's link is also the
// project's "uploaded" mark (`slices/studio/videos.ts`).

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

// The project's YouTube videos, shared by YouTube links and the Shorts section.
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

// The id of the long video's link box: the Shorts section's "Add the link" goes to it.
export const videoLinkBoxId = "on-youtube-video";

// What the Studio extension did after the upload, in a sentence; nothing for a link pasted
// by hand.
function extensionWords(video: YoutubeVideo): string {
  const parts: string[] = [];
  if (video.finishState === "waiting")
    parts.push("The related video, end screen and captions are being set.");
  if (video.finishState === "failed")
    parts.push(`Setting the details failed: ${video.finishMessage ?? "no reason given"}`);
  if (video.commentState === "waiting") parts.push("The comment is pinned once it is public.");
  if (video.commentState === "done") parts.push("Comment pinned.");
  if (video.commentState === "failed")
    parts.push(`Pinning the comment failed: ${video.commentMessage ?? "no reason given"}`);
  if (video.abState === "started")
    parts.push(
      "A/B Testing set up: once you press Set test and Save in Studio, the extension reads its result once a day.",
    );
  if (video.abState === "failed")
    parts.push(
      `Setting up A/B Testing failed: ${video.abMessage ?? "no reason given"} Test it again once that is fixed.`,
    );
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
  const id = useId();
  const { api } = useApp();
  const videos = useProjectVideos(projectId);
  // The project's own "uploaded" mark, made by Mark uploaded or by the long video's link.
  const uploadedAt =
    useQuery(projectsQuery(api)).data?.projects.find((one) => one.id === projectId)?.uploadedAt ??
    null;
  const uploads: readonly (number | null)[] = [
    null,
    ...Array.from({ length: shorts }, (_, index) => index + 1),
  ];
  const long = videos.data?.find((one) => one.short === null && one.uploadState === "done");
  const anyLink = (videos.data ?? []).length > 0;
  return (
    <section aria-labelledby={`${id}-head`} className="flex min-w-0 flex-col gap-2" {...helpScope}>
      <h3 id={`${id}-head`} className="m-0 border-b border-line pb-1.5 text-title-3 font-semibold">
        YouTube links
      </h3>
      <HelpLine>
        Once each one is on YouTube, paste its link here. The long video's link also goes at the end
        of every short's description.
      </HelpLine>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {uploads.map((short) => (
          <UploadRow
            key={short ?? 0}
            projectId={projectId}
            short={short}
            video={videos.data?.find((one) => one.short === short)}
            uploadedAt={short === null ? uploadedAt : null}
          />
        ))}
      </ul>
      <PreviousEpisode projectId={projectId} />
      {anyLink ? (
        <Fold summary="More">
          <div className="flex flex-col gap-2 pt-1">
            {long === undefined ? null : (
              <div className="flex flex-col items-start gap-1">
                <span className="text-small text-ink">
                  Test other titles and thumbnails in YouTube Studio:
                </span>
                <span className="flex flex-wrap gap-2">
                  {(
                    [
                      ["both", "Test titles and thumbnails"],
                      ["titles", "Test titles"],
                      ["thumbnails", "Test thumbnails"],
                    ] as const
                  ).map(([mode, label]) => (
                    <Button
                      key={mode}
                      type="button"
                      size="small"
                      onClick={() =>
                        window.open(
                          abTestUrl(long.videoId, mode, projectId, null),
                          "_blank",
                          "noopener",
                        )
                      }
                    >
                      {label}
                    </Button>
                  ))}
                </span>
                <HelpLine>
                  Opens the video in YouTube Studio with A/B Testing set up by the Slopify Studio
                  extension; press Set test and Save there.
                </HelpLine>
              </div>
            )}
            <p className="sl-help m-0">
              With the Slopify Studio extension (
              <TextLink to="/settings" search={{ section: "studio" }}>
                Settings → YouTube Studio and posting
              </TextLink>
              ) the links are filled in for you.
            </p>
          </div>
        </Fold>
      ) : null}
    </section>
  );
}

function UploadRow({
  projectId,
  short,
  video,
  uploadedAt,
}: {
  readonly projectId: string;
  readonly short: number | null;
  readonly video: YoutubeVideo | undefined;
  // When the project was marked uploaded, for the long video's row.
  readonly uploadedAt: string | null;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const id = useId();
  const name = uploadName(short);
  const what = short === null ? "video's" : `${name.toLowerCase()}'s`;
  const saved = video === undefined ? "" : `https://youtu.be/${video.videoId}`;
  const [value, setValue] = useState<string | undefined>();
  const shown = value ?? saved;
  const changed = shown.trim() !== saved;
  const [error, setError] = useState<string | undefined>();
  const done = (next: readonly YoutubeVideo[]) => {
    client.setQueryData(videosKey(projectId), next);
    setValue(undefined);
    setError(undefined);
    // The long video's link is the project's uploaded mark; every date row reads it too.
    void client.invalidateQueries({ queryKey: keys.projects });
    void client.invalidateQueries({ queryKey: projectReleasesKey(projectId) });
    void client.invalidateQueries({ queryKey: keys.studioReleases });
  };
  const save = useMutation({
    mutationFn: (link: string) => saveProjectVideo(api, projectId, short, link),
    onSuccess: (next) => {
      done(next);
      notify(
        short === null
          ? "Saved the video's link. The project is marked uploaded."
          : `Saved the ${what} link.`,
        "success",
      );
    },
    onError: (failure: Error) => setError(failure.message),
  });
  // Deleted on YouTube, or a wrong link: Slopify forgets the video, so the upload can be made
  // again; Undo saves the same link back.
  const forget = useMutation({
    mutationFn: () => saveProjectVideo(api, projectId, short, ""),
    onSuccess: (next) => {
      done(next);
      const link = saved;
      notify(
        short === null
          ? "Forgot the video's link. The project is back on Ready to upload."
          : `Forgot the ${what} link.`,
        "success",
        { label: "Undo", run: () => save.mutate(link) },
      );
    },
    onError: (failure: Error) =>
      setError(`${failure.message} Press Forget this link again, or clear the box and save.`),
  });
  const state: ReactNode =
    error ??
    (video?.uploadState === "done" ? (
      <>
        <Status tone="done">On YouTube</Status>
        {extensionWords(video) === "" ? null : ` · ${extensionWords(video)}`}
      </>
    ) : video?.uploadState === "filled" ? (
      "Filled in YouTube Studio, not scheduled or published yet. Paste its link once it is up."
    ) : uploadedAt !== null ? (
      <>
        <Status tone="done">Marked uploaded</Status>
        {` ${shortDate(uploadedAt)} · paste its link so the shorts can point to it.`}
      </>
    ) : (
      "Not on YouTube yet"
    ));
  return (
    <li className="flex min-w-0 flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label
          htmlFor={short === null ? videoLinkBoxId : id}
          className="w-16 shrink-0 text-small font-semibold"
        >
          {name}
        </label>
        <Input
          id={short === null ? videoLinkBoxId : id}
          aria-label={`${name} link`}
          aria-describedby={`${id}-state`}
          type="url"
          className="min-w-[180px] flex-1"
          placeholder="https://youtu.be/…"
          value={shown}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(undefined);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && changed && shown.trim() !== "") save.mutate(shown.trim());
          }}
        />
        {video === undefined || changed ? (
          <Button
            type="button"
            size="small"
            className="min-w-[76px]"
            disabled={save.isPending}
            onClick={() =>
              shown.trim() === ""
                ? setError(`Paste the ${what} link from YouTube first.`)
                : save.mutate(shown.trim())
            }
          >
            Save link
          </Button>
        ) : (
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={forget.isPending}
            onClick={() => forget.mutate()}
          >
            Forget this link
          </Button>
        )}
      </div>
      <p
        id={`${id}-state`}
        className={`m-0 pl-19 text-small max-sm:pl-0 ${error !== undefined || video?.finishState === "failed" || video?.commentState === "failed" || video?.abState === "failed" ? "text-danger" : "text-ink-2"}`}
      >
        {state}
      </p>
    </li>
  );
}

// This project's own Previous episode: the link `{{Previous video}}` fills in its description,
// ahead of the one on its channel's Brand tab, and the video its end screen points to.
function PreviousEpisode({ projectId }: { readonly projectId: string }): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const id = useId();
  const edits = useQuery({
    queryKey: keys.youtubeEdits(projectId),
    queryFn: () => readDescriptionEdits(api, projectId),
  });
  const saved =
    edits.data?.links.find((link) => linkKey(link.name) === linkKey(previousVideoLink))?.url ?? "";
  const [value, setValue] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
  const shown = value ?? saved;
  const save = useMutation({
    mutationFn: (url: string) => {
      const others = (edits.data?.links ?? []).filter(
        (link) => linkKey(link.name) !== linkKey(previousVideoLink),
      );
      return saveProjectLinks(
        api,
        projectId,
        url === "" ? others : [...others, { name: previousVideoLink, url }],
      );
    },
    onSuccess: (next: ProjectDescriptionEdits, url) => {
      client.setQueryData(keys.youtubeEdits(projectId), next);
      setValue(undefined);
      setError(undefined);
      notify(
        url === "" ? "Cleared the previous episode." : "Saved the previous episode.",
        "success",
      );
    },
    onError: (failure: Error) => setError(failure.message),
  });
  return (
    <div className="flex min-w-0 flex-col gap-0.5 pt-1" {...helpScope}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={id} className="w-16 shrink-0 text-small font-semibold leading-tight">
          Previous episode
        </label>
        <Input
          id={id}
          type="url"
          className="min-w-[180px] flex-1"
          placeholder="https://youtu.be/…"
          value={shown}
          onChange={(event) => {
            setValue(event.currentTarget.value);
            setError(undefined);
          }}
        />
        <Button
          type="button"
          size="small"
          className="min-w-[76px]"
          disabled={save.isPending || edits.data === undefined}
          onClick={() =>
            shown.trim() === "" && saved === ""
              ? setError("Paste a link first.")
              : save.mutate(shown.trim())
          }
        >
          Save
        </Button>
      </div>
      {error === undefined ? null : (
        <p className="m-0 pl-19 text-small text-danger max-sm:pl-0">{error}</p>
      )}
      <HelpLine className="pl-19 max-sm:pl-0">
        Fills {"{{Previous video}}"} in the description and goes in the end screen. Left empty, the
        end screen uses the last long video you uploaded.
      </HelpLine>
    </div>
  );
}
