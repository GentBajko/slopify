import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useState } from "react";
import { saveProjectVideo } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { HelpLine, Input } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
import { Status } from "@/components/kit/status";
import { useToast } from "@/components/kit/toast";
import { markUploaded } from "@/home/api";
import { shortDate } from "@/lib/utils";
import { useProjectVideos } from "@/project/on-youtube";
import { projectReleasesKey, uploadName } from "@/project/release-times";
import { keys, projectsQuery } from "@/queries";

// Copy for YouTube Studio's last row: once it is up, "I've uploaded it", with the video's link
// when the person has it. The long video's link and the uploaded mark are one fact
// (`slices/studio/videos.ts`): with a link, saving it marks the project uploaded; without one,
// Mark uploaded does. A short is on YouTube by its own link.
export function UploadDone({
  projectId,
  short,
}: {
  readonly projectId: string;
  // null for the long video.
  readonly short: number | null;
}): ReactElement {
  const { api } = useApp();
  const client = useQueryClient();
  const notify = useToast();
  const id = useId();
  const videos = useProjectVideos(projectId);
  const listing = useQuery(projectsQuery(api)).data?.projects.find((one) => one.id === projectId);
  const video = videos.data?.find((one) => one.short === short && one.uploadState === "done");
  const uploadedAt = short === null ? (listing?.uploadedAt ?? null) : null;
  const [link, setLink] = useState("");
  const [error, setError] = useState<string | undefined>();
  const name = uploadName(short);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: keys.projects });
    void client.invalidateQueries({ queryKey: ["project", projectId, "youtube-videos"] });
    void client.invalidateQueries({ queryKey: projectReleasesKey(projectId) });
    void client.invalidateQueries({ queryKey: keys.studioReleases });
  };
  const mark = useMutation({
    mutationFn: async (next: { readonly uploaded: boolean; readonly link: string }) => {
      if (next.link !== "") await saveProjectVideo(api, projectId, short, next.link);
      else if (short === null) await markUploaded(api, projectId, next.uploaded);
    },
    onSuccess: (_, next) => {
      refresh();
      setLink("");
      setError(undefined);
      if (next.uploaded)
        notify(
          short === null
            ? "Marked uploaded. It is off Ready to upload."
            : `Saved the ${name.toLowerCase()}'s link.`,
          "success",
          short === null ? { label: "Undo", run: () => undo.mutate() } : undefined,
        );
    },
    onError: (failure: Error) => setError(failure.message),
  });
  // Not uploaded after all: a saved link is forgotten with the mark, so the two never disagree.
  const undo = useMutation({
    mutationFn: async () => {
      if (video !== undefined) await saveProjectVideo(api, projectId, short, "");
      else if (short === null) await markUploaded(api, projectId, false);
    },
    onSuccess: () => {
      refresh();
      notify(
        short === null ? "Back on Ready to upload." : `Forgot the ${name.toLowerCase()}'s link.`,
        "success",
      );
    },
    onError: (failure: Error) => setError(failure.message),
  });
  const done = video !== undefined || uploadedAt !== null;
  return (
    <section aria-label="Uploaded" className="flex flex-col gap-1" {...helpScope}>
      <div className="sl-kicker">Once it is up</div>
      {done ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Status tone="done">{short === null ? "Uploaded" : "On YouTube"}</Status>
          <span className="text-small text-ink-2">
            {[
              uploadedAt === null ? undefined : shortDate(uploadedAt),
              video === undefined ? undefined : `https://youtu.be/${video.videoId}`,
            ]
              .filter((one) => one !== undefined)
              .join(" · ")}
          </span>
          <Button
            type="button"
            variant="quiet"
            size="small"
            disabled={undo.isPending}
            onClick={() => undo.mutate()}
          >
            {short === null ? "Mark not uploaded" : "Forget this link"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id={id}
            type="url"
            aria-label={short === null ? "Video link (optional)" : `${name} link`}
            className="min-w-[200px] flex-1"
            placeholder={short === null ? "Its link, if you have it" : "https://youtu.be/…"}
            value={link}
            onChange={(event) => {
              setLink(event.currentTarget.value);
              setError(undefined);
            }}
          />
          <Button
            type="button"
            disabled={mark.isPending}
            onClick={() =>
              short !== null && link.trim() === ""
                ? setError(`Paste the ${name.toLowerCase()}'s link from YouTube first.`)
                : mark.mutate({ uploaded: true, link: link.trim() })
            }
          >
            {short === null ? "I've uploaded it" : "Save link"}
          </Button>
        </div>
      )}
      {error === undefined ? null : <p className="m-0 text-small text-danger">{error}</p>}
      {done ? null : (
        <HelpLine>
          {short === null
            ? "Takes it off Ready to upload. Its link also goes at the end of every short's description."
            : "Keeps the short's link with the project, under YouTube links."}
        </HelpLine>
      )}
    </section>
  );
}
