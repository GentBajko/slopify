import { fullVideoLine, shortImageCount, shortUploadText } from "@app/slices/shorts/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { use, useId, useState } from "react";
import { z } from "zod";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
import { FileLink } from "@/components/kit/link";
import { MediaFrame } from "@/components/kit/media";
import { Player } from "@/components/kit/player";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { useOutputText } from "./parts.js";
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
// heading, no box of its own. The clips sit in a grid of small vertical players, three across
// on a wide screen, each with its title, length, a Copy for what goes with the upload, and its
// download. While the stage runs, a clip not rendered yet says how far it got. "Make this
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
  const revisions = use(RevisionControlContext);
  const requestEdit = use(EditRequestContext);
  if (settings?.enabled !== true && list === undefined && videos.length === 0) return null;
  const editable = revisions && requestEdit !== undefined && settings?.enabled === true;
  const copy = (clip: Clip) => {
    const text = shortUploadText(clip, settings?.fullVideoLink);
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="sl-kicker m-0">
          {clips.length === 0 ? "Shorts" : `${String(clips.length)} shorts · 9:16`}
        </h3>
        {editable && clips.length > 0 ? (
          <span className="inline-flex items-center gap-1">
            <Button onClick={() => requestEdit({ section: "shorts", change: pickAgain })}>
              Pick different moments
            </Button>
            <InfoTip id="project.shorts.pick-again" />
          </span>
        ) : null}
      </div>
      {clips.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          {stage.state === "running"
            ? "The clips are picked after the subtitle timing."
            : "Not made yet. They are made with the video."}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-x-5 gap-y-7 p-0">
          {clips.map((clip) => (
            <ShortCard
              key={clip.number}
              clip={clip}
              projectId={project.id}
              review={reviewFor(reviews, { itemKey: `shorts:${String(clip.number)}` })}
              video={videos.find((output) => ofClip(output, clip))}
              images={
                currentShorts(own, "short_image", clips).filter((output) => ofClip(output, clip))
                  .length
              }
              link={fullVideoLine(settings?.fullVideoLink)}
              wanted={shortImageCount(clip.end - clip.start, project.config.imageSeconds)}
              state={stage.state}
              failed={failedHere(stage.failureReason, clip.number)}
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
        </ul>
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
  images,
  wanted,
  state,
  failed,
  link,
  onCopy,
  onRemake,
}: {
  readonly clip: Clip;
  readonly projectId: string;
  // The automatic review's verdict on this short, when it had one.
  readonly review: Review | undefined;
  readonly video: Output | undefined;
  readonly images: number;
  readonly wanted: number;
  readonly state: BodyProps["stage"]["state"];
  readonly failed: boolean;
  readonly link: string;
  readonly onCopy: () => void;
  readonly onRemake?: (() => void) | undefined;
}) {
  const id = useId();
  const media = useOutputMedia(video);
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
        <Player key={video.id} src={media.url} label={`Short ${String(clip.number)}`} portrait />
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
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 id={`${id}-title`} className="min-w-0 break-words text-small font-semibold text-ink">
          {clip.title}
        </h4>
        <Button
          variant="quiet"
          size="small"
          aria-label={`Copy short ${String(clip.number)}'s title, description and hashtags`}
          onClick={onCopy}
        >
          <CopyIcon aria-hidden="true" strokeWidth={1.75} />
          Copy
        </Button>
      </div>
      <p className="m-0 text-label text-ink-3">
        {duration(video?.durationMs ?? Math.round((clip.end - clip.start) * 1000))}
      </p>
      <p className="m-0 break-words text-small text-ink-2">{clip.description}</p>
      <p className="m-0 break-words text-label text-ink-3">{link}</p>
      <p className="m-0 break-words text-small text-ink-2">{clip.hashtags.join(" ")}</p>
      <ReviewVerdict review={review} projectId={projectId} busy={state === "running"} />
      {/* The folder is the stage's one Open folder; each short only downloads here. */}
      {video !== undefined && media !== undefined ? (
        <FileLink href={media.url} download variant="quiet" size="small" className="self-start">
          <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
          Download
        </FileLink>
      ) : null}
      {onRemake === undefined ? null : (
        <Button
          variant="quiet"
          size="small"
          className="self-start"
          aria-label={`Make short ${String(clip.number)} again`}
          onClick={onRemake}
        >
          Make this short again
        </Button>
      )}
    </li>
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
