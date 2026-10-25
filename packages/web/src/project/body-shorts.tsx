import {
  fullVideoLine,
  fullVideoPlaceholder,
  shortImageCount,
  shortUploadText,
} from "@app/slices/shorts/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useNavigate } from "@tanstack/react-router";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { use, useId, useState } from "react";
import { z } from "zod";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { FileLink } from "@/components/kit/link";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import { Switch } from "@/components/kit/switch";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { knownVideoLink, useProjectVideos } from "./on-youtube.js";
import { OutputFolder, useOutputText } from "./parts.js";
import { useReadOnlySample } from "./read-only.js";
import type { Review } from "./review-api.js";
import { ShortsSafeZone } from "./review-safe-zone.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { EditRequestContext, RevisionControlContext } from "./revision-action-context.js";
import { useOutputMedia } from "./revision-media.js";
import { pickAgain, remakeShort } from "./revision-shorts.js";
import { SetDownload } from "./set-download.js";
import { duration } from "./summary.js";

// What `shorts.json` holds for each picked clip.
const listSchema = z.object({
  shorts: z.array(
    z.object({
      number: z.number(),
      first: z.number().optional(),
      last: z.number().optional(),
      start: z.number(),
      end: z.number(),
      title: z.string(),
      description: z.string(),
      hashtags: z.array(z.string()),
    }),
  ),
});
type Clip = z.infer<typeof listSchema>["shorts"][number];

// The Shorts section: one row of 9:16 tiles, each with its title, length, text and, at rest,
// its own Download (.mp4) and Copy for YouTube in words, with Make again under them. Above the
// tiles: every short as one zip, the stage's one Open folder and Pick different moments, then
// one sentence about the link each short's description ends with and the button that fills it
// in. While the stage runs, a clip not rendered yet says how far it got. Make again and Pick
// different moments open the settings' Outputs with the change made, to review and save.
export function ShortsBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const own = outputsOf(outputs, stage);
  const list = roleOf(own, "shorts");
  const clips = useShortClips(own);
  const reviews = useReviews(project.id);
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const [safeZone, setSafeZone] = useState(false);
  const videos = currentShorts(own, "short_video", clips);
  const settings = project.config.shorts;
  const sample = useReadOnlySample(project.id);
  // The link set in the project, else the long video's once Slopify knows it on YouTube.
  const youtube = useProjectVideos(project.id);
  const fullVideoLink = settings?.fullVideoLink ?? knownVideoLink(youtube.data);
  const linked = (fullVideoLink?.trim() ?? "") !== "";
  const revisions = use(RevisionControlContext);
  const requestEdit = use(EditRequestContext);
  if (settings?.enabled !== true && list === undefined && videos.length === 0) return null;
  const editable = revisions && requestEdit !== undefined && settings?.enabled === true && !sample;
  // The long video's link box is under YouTube text when the project writes one; without it,
  // the shorts' own Full video link in the settings' Outputs.
  const youtubeText =
    project.config.youtubeDescription === true ||
    outputs.some((output) => output.role === "youtube_description");
  const addLink = sample
    ? undefined
    : youtubeText
      ? () =>
          void navigate({
            to: "/projects/$projectId",
            params: { projectId: project.id },
            search: { section: "youtube" },
            hash: linkBox,
            resetScroll: false,
          }).then(() => focusWhenShown(linkBox))
      : editable
        ? () => requestEdit({ section: "outputs", change: (edit) => edit })
        : undefined;
  const copy = (clip: Clip) => {
    const text = shortUploadText(clip, fullVideoLink);
    const failed = {
      text: `Couldn't copy short ${String(clip.number)}. Select its text and copy it.`,
      tone: "error" as const,
    };
    if (!navigator.clipboard) {
      setStatus(failed);
      return;
    }
    void navigator.clipboard.writeText(text).then(
      () =>
        setStatus(
          linked
            ? { text: `Copied short ${String(clip.number)} for YouTube.`, tone: "success" }
            : {
                text: `Copied short ${String(clip.number)}. Its last line reads ${fullVideoPlaceholder} until you add the full video's link.`,
                tone: "warning",
              },
        ),
      () => setStatus(failed),
    );
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Every short as one zip (each tile has its own Download), the stage's one Open folder,
          then picking again. */}
      {videos.length === 0 && !(editable && clips.length > 0) ? null : (
        <ButtonRow>
          {videos.length > 1 ? (
            <SetDownload projectId={project.id} set="shorts" members={videos} />
          ) : null}
          <OutputFolder output={videos[0]} />
          {editable && clips.length > 0 ? (
            <Button onClick={() => requestEdit({ section: "outputs", change: pickAgain })}>
              Pick different moments · 1 AI call
            </Button>
          ) : null}
        </ButtonRow>
      )}
      {clips.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          {stage.state === "running"
            ? "The clips are picked once the captions are timed."
            : "Not made yet. They are made with the video."}
        </p>
      ) : (
        <>
          <p className="m-0 flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
            {linked ? (
              <span className="min-w-0 break-all">
                {"Each short's description ends with "}
                <span className="text-ink">{fullVideoLine(fullVideoLink)}</span>
              </span>
            ) : (
              <span>
                Each short's description ends with a link to the full video, once you add it.
              </span>
            )}
            {linked || addLink === undefined ? null : (
              <Button size="small" onClick={addLink}>
                Add the link
              </Button>
            )}
          </p>
          {videos.length === 0 ? null : (
            <Switch
              checked={safeZone}
              onChange={setSafeZone}
              label="Show what YouTube covers on a phone"
              className="self-start"
            />
          )}
          <MediaGrid shorts list label="Shorts" className="gap-y-5">
            {clips.map((clip) => (
              <ShortCard
                key={clip.number}
                clip={clip}
                projectId={project.id}
                review={reviewFor(reviews, { itemKey: `shorts:${String(clip.number)}` })}
                video={videos.find((output) => ofClip(output, clip))}
                stills={currentShorts(own, "short_image", clips)
                  .filter((output) => ofClip(output, clip))
                  .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0))}
                wanted={shortImageCount(clip.end - clip.start, project.config.imageSeconds)}
                state={stage.state}
                failed={failedHere(stage.failureReason, clip.number)}
                onCopy={() => copy(clip)}
                safeZone={safeZone}
                {...(editable
                  ? {
                      onRemake: () =>
                        requestEdit({
                          section: "outputs",
                          change: (edit) => remakeShort(edit, clip.number),
                        }),
                    }
                  : {})}
              />
            ))}
          </MediaGrid>
        </>
      )}
      <StatusSlot tone={status?.tone ?? "info"} wrap>
        {status?.text}
      </StatusSlot>
    </div>
  );
}

// The long video's link box under YouTube text (`on-youtube.tsx`).
const linkBox = "on-youtube-video";

// Focuses an element once the section holding it is shown, so the press that opened the
// section lands the caret in the box it named.
function focusWhenShown(id: string, tries = 20): void {
  const element = document.getElementById(id);
  if (element !== null && element.closest("[hidden]") === null) {
    element.scrollIntoView?.({ block: "center" });
    element.focus();
    return;
  }
  if (tries > 0) requestAnimationFrame(() => focusWhenShown(id, tries - 1));
}

function ShortCard({
  clip,
  projectId,
  review,
  video,
  stills,
  wanted,
  state,
  failed,
  onCopy,
  onRemake,
  safeZone,
}: {
  // Shades where YouTube's buttons and text sit over the short.
  readonly safeZone: boolean;
  readonly clip: Clip;
  readonly projectId: string;
  // The automatic review's verdict on this short, when it had one.
  readonly review: Review | undefined;
  readonly video: Output | undefined;
  // The short's own 9:16 images in order; the first is its poster until it plays.
  readonly stills: readonly Output[];
  readonly wanted: number;
  readonly state: BodyProps["stage"]["state"];
  readonly failed: boolean;
  readonly onCopy: () => void;
  readonly onRemake?: (() => void) | undefined;
}) {
  const id = useId();
  const media = useOutputMedia(video);
  const poster = useOutputMedia(stills[0]);
  const images = stills.length;
  const number = String(clip.number);
  const progress = failed
    ? "Couldn't make this short. Open Error details in the Video section to see why."
    : state !== "running"
      ? "Not made yet. It is made with the video."
      : images < wanted
        ? `Making images · ${String(images)} of ${String(wanted)}`
        : "Making the short";
  return (
    <li aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      {video !== undefined && media !== undefined ? (
        <div className="relative">
          <Player
            key={video.id}
            src={media.url}
            label={`Short ${number}`}
            portrait
            {...(poster === undefined ? {} : { poster: poster.url })}
          />
          {safeZone ? <ShortsSafeZone /> : null}
        </div>
      ) : failed || state !== "running" ? (
        <div className="sl-media__frame sl-media__frame--portrait">
          <p
            className={`m-0 flex size-full items-center justify-center p-3 text-center text-small ${failed ? "text-danger" : "text-ink-3"}`}
          >
            {progress}
          </p>
        </div>
      ) : (
        <MediaFrame alt={`Short ${number}`} aspect="portrait" generating={progress} />
      )}
      <h4 id={`${id}-title`} className="m-0 min-w-0 break-words text-small font-semibold text-ink">
        {clip.title}
      </h4>
      <p className="m-0 text-label text-ink-2 tabular-nums">
        {duration(video?.durationMs ?? Math.round((clip.end - clip.start) * 1000))}
      </p>
      <p className="m-0 break-words text-small text-ink-2">{clip.description}</p>
      <p className="m-0 break-words text-small text-ink-2">{clip.hashtags.join(" ")}</p>
      <ReviewVerdict review={review} projectId={projectId} busy={state === "running"} />
      {/* The tile's actions in words, at rest: its file, and what goes with its upload. */}
      <ButtonRow className="mt-1 gap-1">
        {video !== undefined && media !== undefined ? (
          <FileLink href={media.url} download size="small">
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
            <span>
              Download<span className="sr-only"> short {number}</span> (.mp4)
            </span>
          </FileLink>
        ) : null}
        <Button size="small" onClick={onCopy}>
          <CopyIcon aria-hidden="true" strokeWidth={1.75} />
          <span>
            Copy<span className="sr-only"> short {number}</span> for YouTube
          </span>
        </Button>
      </ButtonRow>
      {onRemake === undefined ? null : (
        <Button variant="quiet" size="small" className="self-start" onClick={onRemake}>
          <span>
            Make<span className="sr-only"> short {number}</span> again
          </span>
        </Button>
      )}
    </li>
  );
}

// A short's video or images belong to the current pick when they were made after it, or
// when they were cut from the same sentences as its clip: a pick made again keeps the work of
// a clip it chose again. Anything else is a clip picked earlier, whose file would otherwise
// sit under the new clip's title until it is rendered again.
function currentShorts(
  outputs: readonly Output[],
  role: "short_video" | "short_image",
  clips: readonly Clip[],
): readonly Output[] {
  const pick = outputs.find((output) => output.role === "shorts");
  return outputs.filter(
    (output) =>
      output.role === role &&
      (pick === undefined ||
        output.createdAt >= pick.createdAt ||
        clips.some(
          (clip) =>
            ofClip(output, clip) &&
            output.meta.sentences?.[0] === clip.first &&
            output.meta.sentences?.[1] === clip.last,
        )),
  );
}

function ofClip(output: Output, clip: Clip): boolean {
  return output.meta.short === clip.number;
}

// The clips the stage's `shorts.json` lists.
function useShortClips(outputs: readonly Output[]): readonly Clip[] {
  return clipsOf(useOutputText(roleOf(outputs, "shorts")).data);
}

function clipsOf(text: string | undefined): readonly Clip[] {
  if (text === undefined) return [];
  try {
    const parsed = listSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.shorts : [];
  } catch {
    return [];
  }
}

// A failed step names its short first ("Short 2: …", "Short 2 image 1: …").
function failedHere(reason: string | null | undefined, number: number): boolean {
  return (
    reason?.startsWith(`Short ${String(number)}:`) === true ||
    reason?.startsWith(`Short ${String(number)} `) === true
  );
}
