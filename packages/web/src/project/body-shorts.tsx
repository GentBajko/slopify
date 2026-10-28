import type { ProjectSummary } from "@app/slices/admission/model.js";
import {
  fullVideoLine,
  fullVideoPlaceholder,
  shortImageCount,
  shortUploadText,
} from "@app/slices/shorts/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useNavigate } from "@tanstack/react-router";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { type ReactElement, use, useId, useState } from "react";
import { z } from "zod";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button, ButtonRow } from "@/components/kit/button";
import { ConfirmDialog } from "@/components/kit/dialog";
import { FileLink, TextLink } from "@/components/kit/link";
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
import {
  EditRequestContext,
  RegenerateNowContext,
  RevisionControlContext,
} from "./revision-action-context.js";
import { useOutputMedia } from "./revision-media.js";
import { pickAgain, pickKey, remakeKey, remakeShort } from "./revision-shorts.js";
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
// different moments ask first, naming their paid calls, then save a version with the change
// and make only what it touches, at once.
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
  const regenerateNow = use(RegenerateNowContext);
  const [asking, setAsking] = useState<Remake | undefined>();
  if (settings?.enabled !== true && list === undefined && videos.length === 0) return null;
  const editable = revisions && requestEdit !== undefined && settings?.enabled === true && !sample;
  // Making a short, or the pick, again: one press and its dialog, then the work starts.
  const remakes = revisions && regenerateNow !== undefined && settings?.enabled === true && !sample;
  const imagesOf = (clip: Clip) =>
    shortImageCount(clip.end - clip.start, project.config.imageSeconds);
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
      {videos.length === 0 && !(remakes && clips.length > 0) ? null : (
        <ButtonRow>
          {videos.length > 1 ? (
            <SetDownload projectId={project.id} set="shorts" members={videos} />
          ) : null}
          <OutputFolder output={videos[0]} />
          {remakes && clips.length > 0 ? (
            <Button onClick={() => setAsking({ kind: "pick" })}>
              Pick different moments · AI and image calls
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
                wanted={imagesOf(clip)}
                state={stage.state}
                failed={failedHere(stage.failureReason, clip.number)}
                onCopy={() => copy(clip)}
                safeZone={safeZone}
                {...(remakes ? { onRemake: () => setAsking({ kind: "short", clip }) } : {})}
              />
            ))}
          </MediaGrid>
        </>
      )}
      <StatusSlot tone={status?.tone ?? "info"} wrap>
        {status?.text}
      </StatusSlot>
      {asking === undefined ? null : (
        <ConfirmDialog
          open
          tone="primary"
          {...remakeWords(asking, asking.kind === "short" ? imagesOf(asking.clip) : 0)}
          onConfirm={() => {
            const chosen = asking;
            setAsking(undefined);
            // The version is saved with the change, then only that short's image prompts, or
            // the pick, is started: what follows from it (the short's images and render, the
            // clips of a new pick) unfolds and is made with it. The dialog named those calls.
            if (chosen.kind === "pick")
              regenerateNow?.([], {
                change: pickAgain,
                starts: (work) => work.key === pickKey,
                unknownPrices: true,
                section: "outputs",
              });
            else
              regenerateNow?.([], {
                change: (edit) => remakeShort(edit, chosen.clip.number),
                starts: (work) => work.key === `${remakeKey(chosen.clip.number)}:prompts`,
                unknownPrices: true,
                section: "outputs",
              });
          }}
          onCancel={() => setAsking(undefined)}
        />
      )}
    </div>
  );
}

type Remake = { readonly kind: "pick" } | { readonly kind: "short"; readonly clip: Clip };

// What each make-again asks, its paid calls first.
function remakeWords(
  remake: Remake,
  images: number,
): {
  readonly title: string;
  readonly consequence: string;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
} {
  if (remake.kind === "pick")
    return {
      title: "Pick different moments?",
      consequence:
        "Paid calls: 1 AI call picks new moments; each short whose moment changes then gets 1 AI call for its image prompts and one image call per image, and is put together on this computer. A short whose moment comes back is kept, and the current shorts stay under Versions.",
      confirmLabel: "Pick different moments",
      cancelLabel: "Keep these moments",
    };
  return {
    title: `Make short ${String(remake.clip.number)} again?`,
    consequence: `${String(images + 1)} paid calls: 1 AI call for its image prompts and ${String(images)} image ${images === 1 ? "call" : "calls"}; it is then put together again on this computer. The current short stays under Versions.`,
    confirmLabel: "Make it again",
    cancelLabel: "Keep it",
  };
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
            quiet
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
      {/* The tile's actions in words, at rest, right under its name: its file, and what goes
          with its upload. Its text to read comes after, so the actions stay on the first
          screen at every width. */}
      <ButtonRow className="gap-1">
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
      <p className="m-0 break-words text-small text-ink-2">{clip.description}</p>
      <p className="m-0 break-words text-small text-ink-2">{clip.hashtags.join(" ")}</p>
      <ReviewVerdict review={review} projectId={projectId} busy={state === "running"} />
      {onRemake === undefined ? null : (
        <Button variant="quiet" size="small" className="self-start" onClick={onRemake}>
          <span>
            Make this short again<span className="sr-only"> (short {number})</span> · {wanted + 1}{" "}
            calls
          </span>
        </Button>
      )}
    </li>
  );
}

// The shorts made from the video, small, under its player: each one's picture, title, length
// and its own download, so the video's first screen holds every file a person takes away.
// Shorts, a press away, has their text, Copy for YouTube and Make again. `own` is the Video
// step's outputs.
export function ShortsStrip({
  project,
  own,
}: {
  readonly project: ProjectSummary;
  readonly own: readonly Output[];
}): ReactElement | null {
  const clips = useShortClips(own);
  const videos = currentShorts(own, "short_video", clips);
  const stills = currentShorts(own, "short_image", clips);
  if (videos.length === 0) return null;
  return (
    <section aria-label="Shorts made from it" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="sl-kicker m-0">{`Shorts made from it · ${String(videos.length)}`}</h3>
        <TextLink
          to="/projects/$projectId"
          params={{ projectId: project.id }}
          search={{ section: "shorts" }}
          resetScroll={false}
          className="text-small"
        >
          Open Shorts
        </TextLink>
      </div>
      <ul className="m-0 flex list-none flex-wrap gap-x-6 gap-y-3 p-0">
        {videos.map((video) => {
          const number = Number(video.meta.short ?? 1);
          const clip = clips.find((one) => one.number === number);
          return (
            <StripShort
              key={video.id}
              video={video}
              number={number}
              title={clip?.title}
              poster={
                stills
                  .filter((still) => still.meta.short === number)
                  .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0))[0]
              }
            />
          );
        })}
      </ul>
    </section>
  );
}

function StripShort({
  video,
  number,
  title,
  poster,
}: {
  readonly video: Output;
  readonly number: number;
  readonly title: string | undefined;
  readonly poster: Output | undefined;
}): ReactElement {
  const media = useOutputMedia(video);
  const picture = useOutputMedia(poster);
  return (
    // The picture beside its words, so the strip is one short row under the player.
    <li className="flex w-[280px] items-start gap-3">
      <MediaFrame
        className="w-[80px] shrink-0"
        alt={`Short ${String(number)}`}
        aspect="portrait"
        {...(picture === undefined ? {} : { src: picture.url })}
      />
      <div className="flex min-w-0 flex-col items-start gap-1">
        <span className="line-clamp-3 text-small font-semibold text-ink">
          {title ?? `Short ${String(number)}`}
        </span>
        <span className="text-label text-ink-2 tabular-nums">
          {duration(video.durationMs ?? 0)}
        </span>
        {media === undefined ? null : (
          <FileLink href={media.url} download size="small">
            <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
            <span>
              Download<span className="sr-only"> short {String(number)}</span> (.mp4)
            </span>
          </FileLink>
        )}
      </div>
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
