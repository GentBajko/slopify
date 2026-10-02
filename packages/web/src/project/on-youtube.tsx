import type { YoutubeVideo } from "@app/slices/studio/videos.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useId, useState } from "react";
import { readProjectVideos, saveProjectVideo, setProjectAbTest } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Input } from "@/components/kit/field";

// On YouTube: the video each of the project's uploads became (the long video and each short),
// as the Slopify Studio extension read it from Studio's upload dialog or as pasted here, and
// its A/B test. Studio tests only public videos and a scheduled one is private until its time,
// so a test waits: the extension starts it once the video is public (`slices/studio/videos.ts`).

const videosKey = (projectId: string) => ["project", projectId, "youtube-videos"] as const;

function uploadName(short: number | null): string {
  return short === null ? "Video" : `Short ${String(short)}`;
}

function abWords(video: YoutubeVideo): string {
  if (video.uploadState === "filled")
    return "Filled in Studio, but not scheduled or published yet (cancelled, or left as a draft). Upload it again from the extension, or paste its link once it is up.";
  switch (video.abState) {
    case "waiting":
      return "A/B test starts once it is public";
    case "started":
      return "A/B test set";
    case "failed":
      return `A/B test failed: ${video.abMessage ?? "the extension gave no reason"}`;
    case "none":
      return "No A/B test";
  }
}

export function OnYoutube({
  projectId,
  shorts,
}: {
  readonly projectId: string;
  // How many shorts the project has, each a row of its own.
  readonly shorts: number;
}): ReactElement {
  const { api } = useApp();
  const videos = useQuery({
    queryKey: videosKey(projectId),
    queryFn: () => readProjectVideos(api, projectId),
  });
  const uploads: readonly (number | null)[] = [
    null,
    ...Array.from({ length: shorts }, (_, index) => index + 1),
  ];
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="sl-field__label">On YouTube</div>
      <p className="m-0 text-small text-ink-3">
        The extension keeps each upload's link when it fills Studio, and starts its A/B test (other
        titles and thumbnails) once the video is public. Paste a link for an upload made by hand.
      </p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {uploads.map((short) => (
          <UploadRow
            key={short ?? 0}
            projectId={projectId}
            short={short}
            video={videos.data?.find((one) => one.short === short)}
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
}: {
  readonly projectId: string;
  readonly short: number | null;
  readonly video: YoutubeVideo | undefined;
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
  const ab = useMutation({
    mutationFn: (start: boolean) => setProjectAbTest(api, projectId, short, start),
    onSuccess: done,
    onError: (failure: Error) => setError(failure.message),
  });
  const waiting = video?.abState === "waiting";
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
        {video === undefined ? null : (
          <Button
            type="button"
            size="small"
            variant="quiet"
            disabled={ab.isPending}
            onClick={() => ab.mutate(!waiting)}
          >
            {waiting
              ? "Cancel A/B test"
              : video.abState === "none"
                ? "Start A/B test"
                : "A/B test again"}
          </Button>
        )}
      </div>
      {video === undefined && error === undefined ? null : (
        <p
          className={`m-0 pl-18 text-small ${error !== undefined || video?.abState === "failed" ? "text-danger" : "text-ink-3"}`}
        >
          {error ?? (video === undefined ? "" : abWords(video))}
        </p>
      )}
    </li>
  );
}
