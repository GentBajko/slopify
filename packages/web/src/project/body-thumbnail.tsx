import { type ProjectSummary, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { DownloadIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { FileLink } from "@/components/kit/link";
import { MediaFrame } from "@/components/kit/media";
import { MenuItem } from "@/components/kit/menu";
import { Badge } from "@/components/kit/status";
import type { BodyProps } from "./body.js";
import { frameAspect } from "./body-images.js";
import { confirmationFor } from "./confirmations.js";
import { useOutputChange } from "./output-change.js";
import type { Review } from "./review-api.js";
import { TileMore } from "./review-image-actions.js";
import { ReviewActions, ReviewChip } from "./review-verdict.js";
import { YouTubePreview } from "./review-youtube-preview.js";
import { useOutputMedia } from "./revision-media.js";

// The thumbnails are the first tiles of the Images grid: one, or three (A, B, C) for YouTube's
// Test & compare, each badged Thumbnail, the same size as the images and with the same actions
// at rest: make it again, download it, and More (compare, replace with a file, see it as
// YouTube shows it).

interface ThumbnailSlot {
  readonly variant: number;
  readonly output: Output | undefined;
}

// Every thumbnail the project makes, made or not yet.
export function thumbnailSlots(
  stage: Stage,
  project: ProjectSummary,
  outputs: readonly Output[],
): readonly ThumbnailSlot[] {
  const count = thumbnailCountOf(project.config);
  return Array.from({ length: count }, (_, index) => index + 1).map((variant) => ({
    variant,
    output: outputs.find(
      (output) =>
        output.stageKind === stage.kind &&
        output.role === "thumbnail" &&
        (output.meta.index ?? 1) === variant,
    ),
  }));
}

// "the thumbnail", or "thumbnail B" of three.
export function thumbnailName(variant: number, count: number): string {
  return count === 1 ? "the thumbnail" : `thumbnail ${String.fromCharCode(64 + variant)}`;
}

export function ThumbnailTile({
  slot,
  count,
  review,
  stage,
  project,
  outputs,
  actions,
  busy,
  sample,
  onOpen,
}: {
  readonly slot: ThumbnailSlot;
  readonly count: number;
  // The automatic review's verdict on this thumbnail, when it had one.
  readonly review: Review | undefined;
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  // A read-only sample: nothing here may spend or change it.
  readonly sample: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const { variant, output } = slot;
  const media = useOutputMedia(output);
  const change = useOutputChange(output, actions, busy);
  const [previewing, setPreviewing] = useState(false);
  const name = thumbnailName(variant, count);
  const again = count === 1 ? "Make the thumbnail again" : `Make ${name} again`;
  useCommand({
    id: `project.thumbnail.${String(variant)}`,
    title: again,
    group: "This project",
    context: project.title,
    keywords: ["thumbnail", "regenerate", "redraw", "remake"],
    run: () => change.act("regenerate-image"),
  });
  const flagged = review !== undefined && !review.passed && review.action === null;
  const copy =
    change.asking === undefined || output === undefined
      ? undefined
      : confirmationFor({
          kind: change.asking,
          outputId: output.id,
          now: change.now,
          thumbnail: true,
          price: change.price,
        });

  return (
    <>
      <MediaFrame
        alt={
          count === 1
            ? `Thumbnail for ${project.title}`
            : `Thumbnail ${String.fromCharCode(64 + variant)} for ${project.title}`
        }
        aspect={frameAspect(project.format)}
        {...(media === undefined ? {} : { src: media.url })}
        {...(output === undefined && stage.state === "running"
          ? { generating: "Making the thumbnail" }
          : {})}
        title={output === undefined ? missing(stage) : "Shown before the video plays"}
        onOpen={onOpen}
        openLabel={`Open ${name} full size`}
        badge={
          <span className="inline-flex flex-wrap gap-1">
            <Badge tone="info">
              {count === 1 ? "Thumbnail" : `Thumbnail ${String.fromCharCode(64 + variant)}`}
            </Badge>
            {review === undefined ? null : <ReviewChip review={review} />}
          </span>
        }
        {...(output === undefined
          ? {}
          : {
              actions: (
                <>
                  {flagged && review !== undefined ? (
                    <ReviewActions review={review} projectId={project.id} busy={busy} />
                  ) : null}
                  {sample ? null : (
                    <Button
                      size="small"
                      disabled={change.unavailable}
                      disabledReason="Wait until the work on this project is done"
                      onClick={() => change.act("regenerate-image")}
                    >
                      {again}
                    </Button>
                  )}
                  {media === undefined ? null : (
                    <FileLink href={media.url} download size="small">
                      <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                      Download<span className="sr-only"> {name}</span>
                    </FileLink>
                  )}
                  <TileMore
                    output={output}
                    name={name}
                    aspect={frameAspect(project.format)}
                    replaceable={
                      !sample &&
                      (project.config.sources.thumbnail === "from_prompt" ||
                        project.config.sources.thumbnail === "prompt_by_llm")
                    }
                    disabled={change.unavailable}
                    extra={
                      <MenuItem onSelect={() => setPreviewing(true)}>
                        See it as YouTube shows it
                      </MenuItem>
                    }
                  />
                </>
              ),
            })}
      />
      {output === undefined ? null : (
        <YouTubePreview
          open={previewing}
          onClose={() => setPreviewing(false)}
          thumbnails={[output]}
          title={project.title}
          durationMs={outputs.find((one) => one.role === "video")?.durationMs ?? null}
          portrait={project.format === "9:16"}
        />
      )}
      <ConfirmDialog
        open={change.asking !== undefined}
        tone="primary"
        title={copy?.title ?? ""}
        consequence={copy?.consequence ?? ""}
        confirmLabel={copy?.verb ?? ""}
        cancelLabel="Keep it"
        pending={actions.pending}
        onConfirm={change.confirm}
        onCancel={change.dismiss}
      />
    </>
  );
}

function missing(stage: Stage): string {
  switch (stage.state) {
    case "running":
      return "Being made";
    case "failed":
    case "canceled":
      return "Not made";
    default:
      return "Not made yet";
  }
}
