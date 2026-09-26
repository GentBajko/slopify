import { shortImageCount } from "@app/slices/shorts/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { CopyIcon, DownloadIcon } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { StatusSlot, type StatusTone } from "@/components/kit/action-bar";
import { Button } from "@/components/ui/button";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { useOutputText } from "./parts.js";
import { useOutputMedia } from "./revision-media.js";
import { duration } from "./summary.js";

// What `shorts.json` holds for each picked clip.
const listSchema = z.object({
  shorts: z.array(
    z.object({
      number: z.number(),
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
// download. While the stage runs, a clip not rendered yet says how far it got.
export function ShortsBlock({ stage, project, outputs }: Omit<BodyProps, "actions" | "busy">) {
  const id = useId();
  const own = outputsOf(outputs, stage);
  const list = roleOf(own, "shorts");
  const listText = useOutputText(list).data;
  const [status, setStatus] = useState<{ text: string; tone: StatusTone } | undefined>();
  const videos = currentShorts(own, "short_video");
  const settings = project.config.shorts;
  if (settings?.enabled !== true && list === undefined && videos.length === 0) return null;
  const clips = clipsOf(listText);
  const copy = (clip: Clip) => {
    const text = [clip.title, "", clip.description, "", clip.hashtags.join(" ")].join("\n");
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
    <section
      aria-labelledby={`${id}-title`}
      className="flex min-w-0 flex-col gap-3 border-t border-line pt-4"
    >
      <h3 id={`${id}-title`} className="engraved text-ink3">
        Shorts
      </h3>
      {clips.length === 0 ? (
        <p className="text-small text-ink2">
          {stage.state === "running"
            ? "The clips are picked after the subtitle timing."
            : "Not made yet. They are made with the video."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
          {clips.map((clip) => (
            <ShortCard
              key={clip.number}
              clip={clip}
              video={videos.find((output) => output.meta.short === clip.number)}
              images={
                currentShorts(own, "short_image").filter(
                  (output) => output.meta.short === clip.number,
                ).length
              }
              wanted={shortImageCount(clip.end - clip.start, project.config.imageSeconds)}
              state={stage.state}
              failed={failedHere(stage.failureReason, clip.number)}
              onCopy={() => copy(clip)}
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
  video,
  images,
  wanted,
  state,
  failed,
  onCopy,
}: {
  readonly clip: Clip;
  readonly video: Output | undefined;
  readonly images: number;
  readonly wanted: number;
  readonly state: BodyProps["stage"]["state"];
  readonly failed: boolean;
  readonly onCopy: () => void;
}) {
  const id = useId();
  const media = useOutputMedia(video);
  const progress = failed
    ? "Couldn't make this short. Open Error details above to see why, then Retry stage."
    : state !== "running"
      ? "Not made yet. It is made with the video."
      : images < wanted
        ? `Making images · ${String(images)} of ${String(wanted)}`
        : "Rendering";
  return (
    <li aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-2">
      {video !== undefined && media !== undefined ? (
        // biome-ignore lint/a11y/useMediaCaption: the captions are burned into the short.
        <video
          key={video.id}
          controls
          preload="metadata"
          src={media.url}
          aria-label={`Short ${String(clip.number)}`}
          className="aspect-[9/16] w-full rounded-control bg-screen"
        />
      ) : (
        <div
          className={`flex aspect-[9/16] w-full items-center justify-center rounded-control bg-panel2 p-3 text-center text-small ${failed ? "text-red" : "text-ink2"}`}
        >
          {progress}
        </div>
      )}
      <div className="flex min-w-0 items-start justify-between gap-2">
        <h4 id={`${id}-title`} className="min-w-0 break-words text-small font-semibold text-ink">
          {clip.title}
        </h4>
        <Button
          type="button"
          variant="ghost"
          aria-label={`Copy short ${String(clip.number)}'s title, description and hashtags`}
          onClick={onCopy}
        >
          <CopyIcon aria-hidden="true" className="size-[14px] shrink-0" />
          Copy
        </Button>
      </div>
      <p className="text-label text-ink3">
        {duration(video?.durationMs ?? Math.round((clip.end - clip.start) * 1000))}
      </p>
      <p className="break-words text-small text-ink2">{clip.description}</p>
      <p className="break-words text-small text-ink2">{clip.hashtags.join(" ")}</p>
      {/* The folder is the stage's one Open folder; each short only downloads here. */}
      {video !== undefined && media !== undefined ? (
        <a
          href={media.url}
          download
          className="inline-flex items-center gap-[5px] self-start rounded-control text-small text-ink2 hover:text-ink"
        >
          <DownloadIcon aria-hidden="true" className="size-[14px] shrink-0" />
          Download
        </a>
      ) : null}
    </li>
  );
}

// A short's video or images made before the current pick belong to clips picked earlier: a
// pick made again may choose fewer or other clips, and until each is rendered again the old
// file would sit under the new clip's title. Everything a pick leads to is made after it.
export function currentShorts(
  outputs: readonly Output[],
  role: "short_video" | "short_image",
): readonly Output[] {
  const pick = outputs.find((output) => output.role === "shorts");
  return outputs.filter(
    (output) => output.role === role && (pick === undefined || output.createdAt >= pick.createdAt),
  );
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
