import { shortImageCount, shortUploadText } from "@app/slices/shorts/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { CopyIcon, DownloadIcon, EllipsisIcon, LinkIcon, RefreshCwIcon } from "lucide-react";
import { use, useId, useState } from "react";
import { z } from "zod";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button, ButtonRow, IconButton } from "@/components/kit/button";
import { helpScope, InfoTip } from "@/components/kit/info-tip";
import { IconFileLink } from "@/components/kit/link";
import { MediaFrame, MediaGrid } from "@/components/kit/media";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/kit/menu";
import { Player } from "@/components/kit/player";
import { Badge } from "@/components/kit/status";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { knownVideoLink, useProjectVideos } from "./on-youtube.js";
import { StageFiles, useOutputText } from "./parts.js";
import type { Review } from "./review-api.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { EditRequestContext, RevisionControlContext } from "./revision-action-context.js";
import { useOutputMedia } from "./revision-media.js";
import { pickAgain, remakeShort } from "./revision-shorts.js";
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

// The Video stage's Shorts part, below the YouTube one and set off the same way: a rule and a
// heading, no box of its own. The clips sit in a grid of vertical players 240 to 280 pixels
// wide, two to four across as the page allows, each with its title, length, a Copy for what
// goes with the upload, and its download (unless it is the only short rendered, which the
// section's Download the short already fetches). While the stage runs, a clip not rendered yet says how far it got. "Make this
// short again" and "Pick different moments" open Edit project → Shorts with the change made,
// to review and save like any other edit.
export function ShortsBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const id = useId();
  const own = outputsOf(outputs, stage);
  const list = roleOf(own, "shorts");
  const clips = useShortClips(own);
  const reviews = useReviews(project.id);
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const videos = currentShorts(own, "short_video", clips);
  const settings = project.config.shorts;
  // The link set in the project, else the long video's once Slopify knows it on YouTube.
  const youtube = useProjectVideos(project.id);
  const fullVideoLink = settings?.fullVideoLink ?? knownVideoLink(youtube.data);
  const revisions = use(RevisionControlContext);
  const requestEdit = use(EditRequestContext);
  if (settings?.enabled !== true && list === undefined && videos.length === 0) return null;
  const editable = revisions && requestEdit !== undefined && settings?.enabled === true;
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
      () => setStatus({ text: `Copied short ${String(clip.number)}.`, tone: "success" }),
      () => setStatus(failed),
    );
  };
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-4">
      <h3 id={`${id}-title`} className="sl-kicker m-0">
        {clips.length === 0
          ? "Shorts"
          : `${String(clips.length)} short${clips.length === 1 ? "" : "s"} · 9:16`}
      </h3>
      {/* Every short behind one Download, the stage's one Open folder, then picking again. */}
      <StageFiles
        files={clips.map((clip) => ({
          output: videos.find((output) => ofClip(output, clip)),
          label: `Short ${String(clip.number)}: ${clip.title} (.mp4)`,
        }))}
        label={videos.length === 1 ? "Download the short" : "Download"}
      >
        {editable && clips.length > 0 ? (
          <span className="inline-flex items-center gap-1" {...helpScope}>
            <Button onClick={() => requestEdit({ section: "shorts", change: pickAgain })}>
              Pick different moments
            </Button>
            <InfoTip id="project.shorts.pick-again" />
          </span>
        ) : null}
      </StageFiles>
      {clips.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          {stage.state === "running"
            ? "The clips are picked after the subtitle timing."
            : "Not made yet. They are made with the video."}
        </p>
      ) : (
        <MediaGrid shorts list label="Shorts" className="gap-y-7">
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
              link={fullVideoLink}
              wanted={shortImageCount(clip.end - clip.start, project.config.imageSeconds)}
              state={stage.state}
              failed={failedHere(stage.failureReason, clip.number)}
              ownDownload={videos.length > 1}
              onCopy={() => copy(clip)}
              {...(editable
                ? {
                    onRemake: () =>
                      requestEdit({
                        section: "shorts",
                        change: (edit) => remakeShort(edit, clip.number),
                      }),
                  }
                : {})}
            />
          ))}
        </MediaGrid>
      )}
      <StatusSlot tone={status?.tone ?? "info"}>{status?.text}</StatusSlot>
    </section>
  );
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
  link,
  ownDownload,
  onCopy,
  onRemake,
}: {
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
  readonly link: string | undefined;
  // False when this is the only short rendered: the section's primary Download the short
  // already fetches it.
  readonly ownDownload: boolean;
  readonly onCopy: () => void;
  readonly onRemake?: (() => void) | undefined;
}) {
  const id = useId();
  const media = useOutputMedia(video);
  const poster = useOutputMedia(stills[0]);
  const images = stills.length;
  const progress = failed
    ? "Couldn't make this short. Open Error details in the Video section to see why."
    : state !== "running"
      ? "Not made yet. It is made with the video."
      : images < wanted
        ? `Making images · ${String(images)} of ${String(wanted)}`
        : "Rendering";
  return (
    <li aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      {video !== undefined && media !== undefined ? (
        <Player
          key={video.id}
          src={media.url}
          label={`Short ${String(clip.number)}`}
          portrait
          {...(poster === undefined ? {} : { poster: poster.url })}
        />
      ) : failed || state !== "running" ? (
        <div className="sl-media__frame sl-media__frame--portrait">
          <p
            className={`m-0 flex size-full items-center justify-center p-3 text-center text-small ${failed ? "text-danger" : "text-ink-3"}`}
          >
            {progress}
          </p>
        </div>
      ) : (
        <MediaFrame alt={`Short ${String(clip.number)}`} aspect="portrait" generating={progress} />
      )}
      <h4 id={`${id}-title`} className="m-0 min-w-0 break-words text-small font-semibold text-ink">
        {clip.title}
      </h4>
      <p className="m-0 text-label text-ink-2 tabular-nums">
        {duration(video?.durationMs ?? Math.round((clip.end - clip.start) * 1000))}
      </p>
      <p className="m-0 break-words text-small text-ink-2">{clip.description}</p>
      <FullVideoLine link={link} />
      <p className="m-0 break-words text-small text-ink-2">{clip.hashtags.join(" ")}</p>
      <ReviewVerdict review={review} projectId={projectId} busy={state === "running"} />
      {/* One row under the text. A card is too narrow for three worded buttons, so these are
          icons with the kit's tooltip, and Make again, the rare one, waits under More. The
          section's Download is the lime one; the folder is the stage's one Open folder. */}
      <ButtonRow className="mt-1 flex-nowrap gap-1">
        {ownDownload && video !== undefined && media !== undefined ? (
          <IconFileLink
            href={media.url}
            download
            size="small"
            label={`Download short ${String(clip.number)}`}
            tip="Download"
          >
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
          </IconFileLink>
        ) : null}
        <IconButton
          size="small"
          tip="Copy title, description and hashtags"
          label={`Copy short ${String(clip.number)}'s title, description and hashtags`}
          onClick={onCopy}
        >
          <CopyIcon aria-hidden="true" strokeWidth={1.75} />
        </IconButton>
        {onRemake === undefined ? null : (
          <Menu>
            <MenuTrigger asChild>
              <IconButton size="small" tip="More" label={`More for short ${String(clip.number)}`}>
                <EllipsisIcon aria-hidden="true" strokeWidth={1.75} />
              </IconButton>
            </MenuTrigger>
            <MenuContent align="start">
              <MenuItem onSelect={onRemake}>
                <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} className="size-4" />
                Make short {String(clip.number)} again
              </MenuItem>
            </MenuContent>
          </Menu>
        )}
      </ButtonRow>
    </li>
  );
}

// The line every short's description ends with. Until the full video's link is saved it says
// so with a marker, not the raw placeholder Copy puts on the clipboard for pasting over.
function FullVideoLine({ link }: { readonly link: string | undefined }) {
  const trimmed = link?.trim() ?? "";
  return (
    <p className="m-0 flex flex-wrap items-center gap-x-2 gap-y-1 break-words text-small text-ink-2">
      <span>Watch the full video:</span>
      {trimmed === "" ? (
        <Badge
          tone="waiting"
          title="No link to the full video is saved. Copy leaves a placeholder to paste it over; to fill it in for every short, add the link under Edit settings → Shorts."
        >
          <LinkIcon aria-hidden="true" strokeWidth={1.75} className="size-3" />
          Link needed
        </Badge>
      ) : (
        <span className="min-w-0 break-all text-ink">{trimmed}</span>
      )}
    </p>
  );
}

// A short's video or images belong to the current pick when they were made after it, or
// when they were cut from the same sentences as its clip: a pick made again keeps the work of
// a clip it chose again. Anything else is a clip picked earlier, whose file would otherwise
// sit under the new clip's title until it is rendered again.
export function currentShorts(
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

// The clips the stage's `shorts.json` lists, read once and shared by the Shorts part and the
// stage's Download menu.
export function useShortClips(outputs: readonly Output[]): readonly Clip[] {
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
