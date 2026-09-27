import type { Format } from "@app/kernel/pipeline.js";
import type { Output } from "@app/slices/storage/model.js";
import { DownloadIcon, RefreshCwIcon, Trash2Icon } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/kit/button";
import { useCommand } from "@/components/kit/command-palette";
import { ConfirmDialog } from "@/components/kit/dialog";
import { Rule } from "@/components/kit/layout";
import { FileLink } from "@/components/kit/link";
import {
  type Aspect,
  Lightbox,
  type LightboxItem,
  MediaFrame,
  MediaGrid,
} from "@/components/kit/media";
import { SectionHead } from "@/components/kit/section-head";
import { Badge } from "@/components/kit/status";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ThumbnailPanel } from "./body-thumbnail.js";
import { confirmationFor } from "./confirmations.js";
import { groupImages } from "./image-groups.js";
import { useOutdated, useOutputChange } from "./output-change.js";
import { DownloadLink } from "./parts.js";
import type { Review } from "./review-api.js";
import { ReviewActions, ReviewChip, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia, useOutputMediaList } from "./revision-media.js";
import { SectionMore } from "./stage-section.js";

// Images: the establishing image the others follow, the thumbnails, then the slideshow images
// grouped by the prompt that made them. Every picture is a media frame: a fixed aspect box on
// `screen`, its caption, its review badge in the corner, Regenerate, Download and Delete on
// hover and focus, and a press opens it full size in the lightbox.

export function aspectOf(format: Format): string {
  return format === "9:16" ? "aspect-[9/16]" : "aspect-video";
}

export function frameAspect(format: Format): Aspect {
  return format === "9:16" ? "portrait" : "landscape";
}

export function ImagesBody({ stage, companion, project, outputs, actions, busy }: BodyProps) {
  const reviews = useReviews(project.id);
  const own = outputsOf(outputs, stage);
  const groups = groupImages(own, project.config.imagePrompts?.map((prompt) => prompt.name) ?? []);
  const all = groups.flatMap((group) => group.images);
  // "Show tables and figures on screen": the cards drawn from the article, in the video's
  // frame, in reading order.
  const cards = own
    .filter(
      (output) =>
        output.role === "figure_card" && (output.meta.format ?? project.format) === project.format,
    )
    .toSorted((left, right) => (left.meta.index ?? 0) - (right.meta.index ?? 0));
  const shown = [...all, ...cards];
  const files = useOutputMediaList(shown);
  const [open, setOpen] = useState<number | null>(null);
  const items: LightboxItem[] = shown.flatMap((image) => {
    const file = files.get(image.id);
    return file === undefined
      ? []
      : [
          {
            src: file.url,
            alt:
              image.role === "figure_card"
                ? `On-screen card ${String(image.meta.index ?? "")}`
                : (image.meta.prompt ?? `Image ${String(image.meta.index ?? "")}`),
            ...(isClip(image) ? { kind: "video" as const } : {}),
            caption:
              image.role === "figure_card"
                ? "Shown while the narration describes it"
                : (image.meta.prompt ?? image.meta.promptName ?? "Slideshow image"),
          },
        ];
  });
  const reference =
    project.config.reference === undefined ? null : (
      <ReferencePanel
        image={roleOf(own, "reference")}
        format={project.format}
        generated={project.config.reference.source === "prompt"}
        affected={all.length}
        actions={actions}
        busy={busy}
      />
    );
  const thumbnail =
    companion?.kind === "thumbnail" ? (
      <ThumbnailPanel
        stage={companion}
        project={project}
        outputs={outputs}
        actions={actions}
        busy={busy}
      />
    ) : null;
  const running = stage.state === "running";
  const waiting =
    running && stage.progressTotal !== null ? Math.max(0, stage.progressTotal - all.length) : 0;
  const reviewed = reviews.filter((review) => all.some((image) => image.id === review.outputId));
  const redone = reviewed.filter((review) => review.passed && review.attempt > 1).length;
  const flagged = reviewed.filter((review) => !review.passed && review.action === null).length;
  const meta = [
    all.length === 0 ? undefined : `${String(all.length)} in the video`,
    reviewed.length === 0 ? undefined : "reviewed",
    redone === 0 ? undefined : `${String(redone)} redone after review`,
    flagged === 0 ? undefined : `${String(flagged)} flagged`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  return (
    <>
      {reference}
      {reference === null || (thumbnail === null && stage.state === "skipped") ? null : (
        <Rule className="m-0" />
      )}
      {thumbnail}
      {thumbnail === null || stage.state === "skipped" ? null : <Rule className="m-0" />}
      {stage.state === "skipped" ? null : (
        <section aria-label="Slideshow images" className="flex min-w-0 flex-col gap-5">
          <SectionHead title="Images" {...(meta === "" ? {} : { meta })}>
            <DownloadLink projectId={project.id} asset="images.zip" label="Download all" />
            <SectionMore stages={[stage]} project={project} actions={actions} />
          </SectionHead>
          {groups.length === 0 && waiting === 0 ? (
            <p className="m-0 text-small text-ink-2">
              {stage.state === "pending"
                ? "The images are made once the narration is timed."
                : "No images have landed yet."}
            </p>
          ) : null}
          {groups.map((group, index) => (
            <ImageGroup
              key={group.name}
              name={group.name}
              count={group.images.length}
              showName={groups.length > 1}
              trailing={
                index === groups.length - 1 && waiting > 0
                  ? Array.from({ length: Math.min(waiting, 3) }, (_, slot) => (
                      <MediaFrame
                        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity of their own.
                        key={slot}
                        alt="An image being made"
                        aspect={frameAspect(project.format)}
                        generating={slot === 0 ? "Drawing the next image" : "Waiting its turn"}
                      />
                    ))
                  : null
              }
            >
              {(limit) =>
                group.images.slice(0, limit).map((image) => {
                  const at = all.indexOf(image);
                  return (
                    <ImageTile
                      key={image.id}
                      image={image}
                      projectId={project.id}
                      review={reviewFor(reviews, { outputId: image.id })}
                      format={project.format}
                      actions={actions}
                      busy={busy}
                      onOpen={() => setOpen(at)}
                    />
                  );
                })
              }
            </ImageGroup>
          ))}
          {cards.length === 0 ? null : (
            <ImageGroup name="From the article" count={cards.length} showName>
              {(limit) =>
                cards
                  .slice(0, limit)
                  .map((card) => (
                    <ImageTile
                      key={card.id}
                      image={card}
                      projectId={project.id}
                      review={undefined}
                      format={project.format}
                      actions={actions}
                      busy={busy}
                      card
                      onOpen={() => setOpen(shown.indexOf(card))}
                    />
                  ))
              }
            </ImageGroup>
          )}
          {groups.length === 0 && waiting > 0 ? (
            <MediaGrid label="Images being made">
              {Array.from({ length: Math.min(waiting, 3) }, (_, slot) => (
                <MediaFrame
                  // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity of their own.
                  key={slot}
                  alt="An image being made"
                  aspect={frameAspect(project.format)}
                  generating={slot === 0 ? "Drawing the first image" : "Waiting its turn"}
                />
              ))}
            </MediaGrid>
          ) : null}
          <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />
        </section>
      )}
    </>
  );
}

const isClip = (image: Output): boolean => /\.(mp4|mov|m4v|webm|mkv)$/i.test(image.path);

// The establishing image, above the slideshow it is never part of: labelled as the reference
// the other images are drawn from, with Regenerate when it was made from a prompt.
function ReferencePanel({
  image,
  format,
  generated,
  affected,
  actions,
  busy,
}: {
  readonly image: Output | undefined;
  readonly format: Format;
  readonly generated: boolean;
  // How many images follow it, and so become outdated when it is made again.
  readonly affected: number;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const media = useOutputMedia(image);
  const change = useOutputChange(image, actions, busy);
  return (
    <section aria-label="Establishing image" className="flex min-w-0 flex-col gap-5">
      <SectionHead
        kicker="Reference · not in the video"
        title="Establishing image"
        meta="Every image follows it for the look, palette and style"
      >
        {image !== undefined && generated ? (
          <Button
            disabled={change.unavailable}
            disabledReason="Wait until the work on this project is done"
            onClick={() => change.act("regenerate-image")}
          >
            Make the establishing image again
          </Button>
        ) : null}
      </SectionHead>
      <div className="grid min-w-0 items-start gap-6 md:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        <MediaFrame
          alt={image?.meta.prompt ?? "Establishing image"}
          aspect={frameAspect(format)}
          {...(media === undefined ? {} : { src: media.url })}
          title="Establishing image"
          {...(image === undefined ? { meta: "Not made yet" } : {})}
          {...(image === undefined || media === undefined
            ? {}
            : {
                actions: (
                  <FileLink
                    href={media.url}
                    download
                    aria-label="Download the establishing image"
                    variant="secondary"
                    size="small"
                  >
                    <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                    Download
                  </FileLink>
                ),
              })}
        />
        {generated && affected > 0 ? (
          <p className="m-0 text-small text-ink-2">
            {`Making it again marks ${String(affected)} image${affected === 1 ? "" : "s"} outdated. They keep their current version until you remake them.`}
          </p>
        ) : null}
      </div>
      <ConfirmDialog
        open={change.asking !== undefined}
        tone="primary"
        title="Make the establishing image again?"
        consequence={`A new establishing image replaces this one${affected > 0 ? `, and the ${String(affected)} images drawn from it become outdated until you remake them` : ""}. The old one stays in History.`}
        confirmLabel="Make it again"
        cancelLabel="Keep this one"
        pending={actions.pending}
        onConfirm={change.confirm}
        onCancel={change.dismiss}
      />
    </section>
  );
}

// Two rows, then "Show all": a group of sixty images does not turn the section into a page
// of several thousand pixels. The cap is the reader's to lift.
export const imageGroupCap = 12;

function ImageGroup({
  name,
  count,
  showName,
  trailing,
  children,
}: {
  readonly name: string;
  readonly count: number;
  readonly showName: boolean;
  readonly trailing?: ReactNode;
  readonly children: (limit: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const capped = count > imageGroupCap && !expanded;
  return (
    <section aria-label={`${name} × ${String(count)}`} className="flex flex-col gap-3">
      {showName ? <h3 className="sl-kicker m-0">{`${name} × ${String(count)}`}</h3> : null}
      <MediaGrid>
        {children(capped ? imageGroupCap : count)}
        {trailing}
      </MediaGrid>
      {count > imageGroupCap ? (
        <Button
          variant="quiet"
          aria-expanded={expanded}
          className="self-start"
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Show fewer" : `Show all ${String(count)} images`}
        </Button>
      ) : null}
    </section>
  );
}

function ImageTile({
  image,
  projectId,
  review,
  format,
  actions,
  busy,
  card = false,
  onOpen,
}: {
  readonly image: Output;
  readonly projectId: string;
  // A card drawn from the article: made again from the article, never deleted on its own.
  readonly card?: boolean;
  // The automatic review's verdict on this image, when it had one.
  readonly review: Review | undefined;
  readonly format: Format;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const media = useOutputMedia(image);
  const number = image.meta.index === undefined ? "" : ` ${String(image.meta.index)}`;
  const name = card ? `on-screen card${number}` : `image${number}`;
  const change = useOutputChange(image, actions, busy);
  const outdated = useOutdated(image);
  // Every image is a palette command too: "Regenerate image 4".
  useCommand({
    id: `project.image.${image.id}`,
    title: `Regenerate ${name}`,
    group: "This project",
    keywords: ["image", "redraw", "remake", image.meta.promptName ?? ""],
    run: () => change.act("regenerate-image"),
  });
  const flagged = review !== undefined && !review.passed && review.action === null;
  const copy =
    change.asking === undefined
      ? undefined
      : confirmationFor({ kind: change.asking, outputId: image.id });
  return (
    <>
      <MediaFrame
        alt={card ? `On-screen card${number}` : (image.meta.prompt ?? `Slideshow ${name}`)}
        kind={isClip(image) ? "video" : "image"}
        aspect={frameAspect(format)}
        {...(media === undefined ? {} : { src: media.url })}
        title={card ? `Card${number}` : (image.meta.prompt ?? `Image${number}`)}
        {...(image.meta.index === undefined ? {} : { meta: `#${String(image.meta.index)}` })}
        onOpen={onOpen}
        openLabel={`Open ${name} full size`}
        {...(review === undefined && !outdated
          ? {}
          : {
              badge: (
                <span className="inline-flex flex-wrap gap-1">
                  {outdated ? <Badge tone="info">Outdated</Badge> : null}
                  {review === undefined ? null : <ReviewChip review={review} />}
                </span>
              ),
            })}
        actionsShown={flagged}
        actions={
          <>
            {flagged && review !== undefined ? (
              <ReviewActions review={review} projectId={projectId} busy={busy} />
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
              <FileLink
                href={media.url}
                download
                aria-label={`Download ${name}`}
                title={`Download ${name}`}
                variant="secondary"
                size="small"
              >
                <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
              </FileLink>
            )}
            {card ? null : (
              <Button
                size="small"
                variant="destructive"
                disabled={change.unavailable}
                disabledReason="Wait until the work on this project is done"
                onClick={() => change.act("delete-image")}
                aria-label={`Delete ${name}`}
                title={`Delete ${name}`}
              >
                <Trash2Icon aria-hidden="true" strokeWidth={1.75} />
              </Button>
            )}
          </>
        }
      />
      <ConfirmDialog
        open={change.asking !== undefined}
        tone={change.asking === "delete-image" ? "destructive" : "primary"}
        title={copy?.title ?? ""}
        consequence={copy?.consequence ?? ""}
        confirmLabel={
          change.asking === "delete-image" ? "Delete the image" : "Regenerate the image"
        }
        cancelLabel="Keep it"
        pending={actions.pending}
        onConfirm={change.confirm}
        onCancel={change.dismiss}
      />
    </>
  );
}
