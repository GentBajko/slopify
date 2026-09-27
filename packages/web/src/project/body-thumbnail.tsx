import { type ProjectSummary, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { RefreshCwIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Lightbox, type LightboxItem, MediaFrame, MediaGrid } from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import type { BodyProps } from "./body.js";
import { outputsOf } from "./body.js";
import { DownloadButton, frameAspect, OutputLightboxActions } from "./body-images.js";
import { confirmationFor } from "./confirmations.js";
import { useOutputChange } from "./output-change.js";
import { DownloadMenu, OutputFolder } from "./parts.js";
import type { Review } from "./review-api.js";
import { ReviewActions, ReviewChip, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia, useOutputMediaList } from "./revision-media.js";
import { SectionMore } from "./stage-section.js";

// The thumbnails above the slideshow images: one, or three side by side for YouTube's Test &
// compare, each a media frame with its own Regenerate and Download and its review badge. The
// prompt behind them is not shown; the picture is what gets judged.
export function ThumbnailPanel({
  stage,
  project,
  outputs,
  actions,
  busy,
}: {
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly outputs: readonly Output[];
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}): ReactElement {
  const own = outputsOf(outputs, stage);
  const reviews = useReviews(project.id);
  const count = thumbnailCountOf(project.config);
  const variants = Array.from({ length: count }, (_, index) => index + 1).map((variant) => ({
    variant,
    output: own.find(
      (output) => output.role === "thumbnail" && (output.meta.index ?? 1) === variant,
    ),
  }));
  const made = variants.flatMap((one) => (one.output === undefined ? [] : [one.output]));
  const files = useOutputMediaList(made);
  const [open, setOpen] = useState<number | null>(null);
  // The thumbnails the lightbox pages through, and the output behind each, for its actions.
  const openable = made.filter((output) => files.has(output.id));
  const items: LightboxItem[] = openable.map((output) => ({
    src: files.get(output.id)?.url ?? "",
    alt: `Thumbnail ${String(output.meta.index ?? 1)}`,
  }));
  const tall = project.format === "9:16";
  const tile = ({ variant, output }: (typeof variants)[number]): ReactElement => (
    <ThumbnailVariant
      key={variant}
      variant={variant}
      count={count}
      output={output}
      review={reviewFor(reviews, { outputId: output?.id })}
      stage={stage}
      project={project}
      actions={actions}
      busy={busy}
      onOpen={() => setOpen(output === undefined ? null : opened(openable, output))}
    />
  );
  return (
    <section
      aria-label={count === 1 ? "Thumbnail" : "Thumbnails"}
      className="flex min-w-0 flex-col gap-5"
    >
      <SectionHead
        title={count === 1 ? "Thumbnail" : "Thumbnails"}
        meta={
          count === 1
            ? "The picture YouTube shows before the video plays"
            : `${String(count)} variants for YouTube's Test & compare`
        }
      >
        {/* Secondary: the Images section's main action is its Download all, below. */}
        <DownloadMenu
          variant="secondary"
          files={made.map((output) => ({
            output,
            label: count === 1 ? "Thumbnail" : `Thumbnail ${String(output.meta.index ?? 1)}`,
          }))}
        />
        <OutputFolder output={made[0]} />
        <SectionMore stages={[stage]} project={project} actions={actions} />
      </SectionHead>
      {/* One thumbnail is a single picture, not a gallery; Test & compare's three are. */}
      {variants.length === 1 ? (
        <div className={tall ? "max-w-[280px]" : "max-w-[480px]"}>{variants.map(tile)}</div>
      ) : (
        <MediaGrid list label="Thumbnail variants">
          {variants.map((one) => (
            <li key={one.variant} className="min-w-0">
              {tile(one)}
            </li>
          ))}
        </MediaGrid>
      )}
      <Lightbox
        items={items}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
        actions={(_, index) => {
          const output = openable[index];
          return output === undefined ? null : (
            <OutputLightboxActions
              key={output.id}
              output={output}
              name={count === 1 ? "the thumbnail" : `thumbnail ${String(output.meta.index ?? 1)}`}
              actions={actions}
              busy={busy}
              onLeave={() => setOpen(null)}
            />
          );
        }}
      />
    </section>
  );
}

function ThumbnailVariant({
  variant,
  count,
  output,
  review,
  stage,
  project,
  actions,
  busy,
  onOpen,
}: {
  readonly variant: number;
  readonly count: number;
  readonly output: Output | undefined;
  // The automatic review's verdict on this thumbnail, when it had one.
  readonly review: Review | undefined;
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const media = useOutputMedia(output);
  const change = useOutputChange(output, actions, busy);
  const name = count === 1 ? "the thumbnail" : `thumbnail ${String(variant)}`;
  useCommand({
    id: `project.thumbnail.${String(variant)}`,
    title: count === 1 ? "Regenerate the thumbnail" : `Regenerate thumbnail ${String(variant)}`,
    group: "This project",
    context: project.title,
    keywords: ["thumbnail", "redraw", "remake"],
    run: () => change.act("regenerate-image"),
  });
  const flagged = review !== undefined && !review.passed && review.action === null;
  const letter = String.fromCharCode(64 + variant);
  const copy =
    change.asking === undefined || output === undefined
      ? undefined
      : confirmationFor({ kind: change.asking, outputId: output.id });
  return (
    <>
      <MediaFrame
        alt={
          count === 1
            ? `Thumbnail for ${project.title}`
            : `Thumbnail ${String(variant)} for ${project.title}`
        }
        aspect={frameAspect(project.format)}
        {...(media === undefined ? {} : { src: media.url })}
        {...(output === undefined && stage.state === "running"
          ? { generating: "Making the thumbnail" }
          : {})}
        title={count === 1 ? "Thumbnail" : letter}
        {...(output === undefined ? { meta: missing(stage) } : {})}
        onOpen={onOpen}
        openLabel={`Open ${name} full size`}
        {...(review === undefined ? {} : { badge: <ReviewChip review={review} /> })}
        actionsShown={flagged}
        {...(output === undefined
          ? {}
          : {
              actions: (
                <>
                  {flagged && review !== undefined ? (
                    <ReviewActions review={review} projectId={project.id} busy={busy} />
                  ) : null}
                  <Button
                    size="small"
                    disabled={change.unavailable}
                    disabledReason="Wait until the work on this project is done"
                    onClick={() => change.act("regenerate-image")}
                    aria-label={`Regenerate ${name}`}
                  >
                    <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
                    Regenerate
                  </Button>
                  {media === undefined ? null : (
                    <DownloadButton href={media.url} label={`Download ${name}`} />
                  )}
                </>
              ),
            })}
      />
      <ConfirmDialog
        open={change.asking !== undefined}
        tone="primary"
        title={copy?.title ?? ""}
        consequence={copy?.consequence ?? ""}
        confirmLabel="Regenerate the thumbnail"
        cancelLabel="Keep it"
        pending={actions.pending}
        onConfirm={change.confirm}
        onCancel={change.dismiss}
      />
    </>
  );
}

// Where a thumbnail sits in the lightbox, or closed when its file is not there yet.
function opened(openable: readonly Output[], output: Output): number | null {
  const at = openable.indexOf(output);
  return at === -1 ? null : at;
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
