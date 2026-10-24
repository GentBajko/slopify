import type { Format } from "@app/kernel/pipeline.js";
import type { Output } from "@app/slices/storage/model.js";
import { DownloadIcon, RefreshCwIcon } from "lucide-react";
import { type ReactElement, type ReactNode, useState } from "react";
import { Button } from "@/components/kit/button";
import { ConfirmDialog, Dialog } from "@/components/kit/dialog";
import { Checkbox, HelpLine } from "@/components/kit/field";
import { helpScope } from "@/components/kit/info-tip";
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
import { ThumbnailTile, thumbnailName, thumbnailSlots } from "./body-thumbnail.js";
import { confirmationFor } from "./confirmations.js";
import { groupImages } from "./image-groups.js";
import { imageTitles } from "./image-titles.js";
import { useOutdated, useOutputChange, useRegenerateAll } from "./output-change.js";
import { OutputFolder } from "./parts.js";
import { sampleReason, useReadOnlySample } from "./read-only.js";
import { useRegenerateByNumber } from "./regenerate-by-number.js";
import type { Review } from "./review-api.js";
import { TileMore } from "./review-image-actions.js";
import { ReviewActions, ReviewChip, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia, useOutputMediaList } from "./revision-media.js";
import { SetDownload } from "./set-download.js";
import { rerunPrice, useRunCost } from "./stage-price.js";
import { useRerunnable } from "./stage-section.js";

// Images: one grid, the thumbnail first (badged Thumbnail) and then the slideshow images,
// grouped by the prompt that made them when there are several, every tile the same size.
// Each tile shows its actions at rest, in words: make it again, download it, and More
// (compare, replace with a file, delete); "Full size" opens it in the lightbox. The head has
// the one zip of the images, the one folder and the one button that makes them all again. The
// establishing image the others follow, which is not in the video, comes after.

export function frameAspect(format: Format): Aspect {
  return format === "9:16" ? "portrait" : format === "1:1" ? "square" : "landscape";
}

// Four tiles across a project's main column at 1440 pixels: 200 pixels at the least.
const gridColumns = "[grid-template-columns:repeat(auto-fill,minmax(200px,1fr))] gap-x-3 gap-y-4";

export function ImagesBody({ stage, companion, project, outputs, actions, busy }: BodyProps) {
  const reviews = useReviews(project.id);
  const sample = useReadOnlySample(project.id);
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
  const thumbnailStage = companion?.kind === "thumbnail" ? companion : undefined;
  const slots =
    thumbnailStage === undefined ? [] : thumbnailSlots(thumbnailStage, project, outputs);
  const thumbnails = slots.flatMap((slot) => (slot.output === undefined ? [] : [slot.output]));
  const shown = [...thumbnails, ...all, ...cards];
  const regenerate = useRegenerateByNumber(project, all, cards, actions, busy);
  const files = useOutputMediaList(shown);
  const [open, setOpen] = useState<number | null>(null);
  // The pictures the lightbox pages through, and the output behind each, for its actions.
  const openable = shown.filter((image) => files.has(image.id));
  const titles = imageTitles(openable.map((image) => image.meta.prompt));
  const items: LightboxItem[] = openable.map((image, index) => ({
    src: files.get(image.id)?.url ?? "",
    ...(image.role === "thumbnail"
      ? { title: "Thumbnail" }
      : image.role === "figure_card" || titles[index] === undefined
        ? {}
        : { title: titles[index] }),
    alt:
      image.role === "figure_card"
        ? `On-screen card ${String(image.meta.index ?? "")}`
        : image.role === "thumbnail"
          ? `Thumbnail for ${project.title}`
          : (image.meta.prompt ?? `Image ${String(image.meta.index ?? "")}`),
    ...(isClip(image) ? { kind: "video" as const } : {}),
    caption:
      image.role === "figure_card"
        ? "Shown while the narration describes it"
        : (image.meta.prompt ??
          (image.role === "thumbnail" ? "Your own picture" : image.meta.promptName) ??
          "Slideshow image"),
  }));
  const imagesOn = stage.state !== "skipped";
  const running = stage.state === "running";
  const waiting =
    running && stage.progressTotal !== null ? Math.max(0, stage.progressTotal - all.length) : 0;
  const reviewed = reviews.filter((review) => all.some((image) => image.id === review.outputId));
  const redone = reviewed.filter((review) => review.passed && review.attempt > 1).length;
  const flagged = reviewed.filter((review) => !review.passed && review.action === null).length;
  const meta = [
    !imagesOn
      ? undefined
      : `${String(all.length)} in the video${
          slots.length === 0
            ? ""
            : slots.length === 1
              ? " + thumbnail"
              : ` + ${String(slots.length)} thumbnails`
        }`,
    reviewed.length === 0 ? undefined : "reviewed",
    redone === 0 ? undefined : `${String(redone)} redone after review`,
    flagged === 0 ? undefined : `${String(flagged)} flagged`,
  ]
    .filter((part) => part !== undefined)
    .join(" · ");
  const opener = (output: Output) => () => setOpen(opened(openable, output));
  const thumbnailTiles = slots.map((slot) =>
    thumbnailStage === undefined ? null : (
      <ThumbnailTile
        key={`thumbnail-${String(slot.variant)}`}
        slot={slot}
        count={slots.length}
        review={reviewFor(reviews, { outputId: slot.output?.id })}
        stage={thumbnailStage}
        project={project}
        outputs={outputs}
        actions={actions}
        busy={busy}
        sample={sample}
        onOpen={slot.output === undefined ? () => undefined : opener(slot.output)}
      />
    ),
  );
  const placeholders = (first: string) =>
    Array.from({ length: Math.min(waiting, 3) }, (_, slot) => (
      <MediaFrame
        // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity of their own.
        key={slot}
        alt="An image being made"
        aspect={frameAspect(project.format)}
        generating={slot === 0 ? first : "Waiting its turn"}
      />
    ));
  // With one prompt the thumbnail leads the images' own grid; with several, it has its own
  // row ahead of theirs.
  const together = groups.length <= 1;
  const tile = (image: Output, title: string | undefined) => (
    <ImageTile
      key={image.id}
      image={image}
      title={title}
      projectId={project.id}
      review={reviewFor(reviews, { outputId: image.id })}
      format={project.format}
      actions={actions}
      busy={busy}
      sample={sample}
      onOpen={opener(image)}
    />
  );
  const lead = slots.length === 0 ? null : thumbnailTiles;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {regenerate}
      <SectionHead
        title={imagesOn ? "Images" : slots.length > 1 ? "Thumbnails" : "Thumbnail"}
        className="pb-0"
        {...(meta === "" ? {} : { meta })}
      >
        {imagesOn ? (
          <SetDownload projectId={project.id} set="images" members={all} />
        ) : thumbnails.length > 1 ? (
          <SetDownload projectId={project.id} set="thumbnails" members={thumbnails} />
        ) : null}
        <OutputFolder output={all[0] ?? thumbnails[0]} />
        {imagesOn ? (
          <ImagesAgain
            stage={stage}
            project={project}
            images={all}
            actions={actions}
            busy={busy}
            sample={sample}
          />
        ) : null}
      </SectionHead>
      {shown.length === 0 ? null : (
        <p className="m-0 text-small text-ink-2">
          {sample
            ? sampleReason
            : "Making a picture again is one paid image call; the video shows it once the video is made again."}
        </p>
      )}
      {imagesOn && groups.length === 0 && waiting === 0 && slots.length === 0 ? (
        <p className="m-0 text-small text-ink-2">
          {stage.state === "pending"
            ? "The images are made once the narration is timed."
            : "No images have landed yet."}
        </p>
      ) : null}
      {lead !== null && (!together || !imagesOn) ? (
        <ImageGroup name="Thumbnail" count={slots.length} showName={imagesOn} leading={lead}>
          {() => null}
        </ImageGroup>
      ) : null}
      {imagesOn
        ? groups.map((group, index) => (
            <ImageGroup
              key={group.name}
              name={group.name}
              count={group.images.length}
              showName={groups.length > 1}
              leading={together && index === 0 ? lead : null}
              trailing={
                index === groups.length - 1 && waiting > 0
                  ? placeholders("Drawing the next image")
                  : null
              }
            >
              {(limit) => {
                const names = imageTitles(group.images.map((image) => image.meta.prompt));
                return group.images.slice(0, limit).map((image, at) => tile(image, names[at]));
              }}
            </ImageGroup>
          ))
        : null}
      {imagesOn && groups.length === 0 && (waiting > 0 || (together && lead !== null)) ? (
        <MediaGrid className={gridColumns}>
          {lead}
          {placeholders("Drawing the first image")}
        </MediaGrid>
      ) : null}
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
                  sample={sample}
                  card
                  onOpen={opener(card)}
                />
              ))
          }
        </ImageGroup>
      )}
      {project.config.reference === undefined ? null : (
        <ReferencePanel
          image={roleOf(own, "reference")}
          format={project.format}
          generated={project.config.reference.source === "prompt"}
          affected={all.length}
          actions={actions}
          busy={busy}
          sample={sample}
        />
      )}
      <Lightbox
        items={items}
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
        actions={(_, index) => {
          const image = openable[index];
          if (image === undefined) return null;
          const slot = slots.find((one) => one.output?.id === image.id);
          return (
            <OutputLightboxActions
              key={image.id}
              output={image}
              name={
                slot !== undefined
                  ? thumbnailName(slot.variant, slots.length)
                  : image.role === "figure_card"
                    ? `on-screen card${numberOf(image)}`
                    : `image${numberOf(image)}`
              }
              thumbnail={slot !== undefined}
              actions={actions}
              busy={busy}
              sample={sample}
            />
          );
        }}
      />
    </div>
  );
}

const isClip = (image: Output): boolean => /\.(mp4|mov|m4v|webm|mkv)$/i.test(image.path);

const numberOf = (image: Output): string =>
  image.meta.index === undefined ? "" : ` ${String(image.meta.index)}`;

// Where a tile's picture sits in the lightbox, or closed when its file is not there yet.
function opened(openable: readonly Output[], image: Output): number | null {
  const at = openable.indexOf(image);
  return at === -1 ? null : at;
}

// The Images head's one make-again button, named with how many it draws and what that costs.
// Its dialog asks whether the video is made again with them (free, on by default): without
// it the pictures are drawn now and the video keeps the old ones until it is made again.
function ImagesAgain({
  stage,
  project,
  images,
  actions,
  busy,
  sample,
}: {
  readonly stage: BodyProps["stage"];
  readonly project: BodyProps["project"];
  readonly images: readonly Output[];
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  readonly sample: boolean;
}): ReactElement | null {
  const rerun = useRerunnable([stage]).length > 0;
  const now = useRegenerateAll(images, busy);
  const cost = useRunCost(project.id);
  const [asking, setAsking] = useState(false);
  const [withVideo, setWithVideo] = useState(true);
  if (!rerun && now === undefined) return null;
  const count = now?.count ?? images.length;
  const both = rerun && now !== undefined;
  const videoToo = now === undefined || (both && withVideo);
  const working =
    actions.pending || project.status === "running" || stage.state === "running" || busy;
  const many = count === 1 ? "the image" : `all ${String(count)} images`;
  const calls = `${String(count)} image ${count === 1 ? "call" : "calls"}`;
  const price = videoToo ? rerunPrice(cost, "images") : now?.price?.text;
  const consequence = videoToo
    ? confirmationFor({ kind: "rerun", stage: "images", price }).consequence
    : `${price === undefined ? "" : `${price} `}Draws every image again now, one paid image call each; the video keeps the current pictures until you make it again.`;
  return (
    <>
      <Button
        size="small"
        disabled={sample || working}
        focusableWhenDisabled
        disabledReason={sample ? sampleReason : "Wait until the work on this project is done"}
        onClick={() => {
          setWithVideo(true);
          setAsking(true);
        }}
      >
        <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
        {`Make ${many} again · ${calls}`}
      </Button>
      <Dialog
        open={asking}
        onOpenChange={(next) => {
          if (!next) setAsking(false);
        }}
        title={`Make ${many} again?`}
        description={consequence}
        footer={
          <>
            <Button variant="secondary" autoFocus onClick={() => setAsking(false)}>
              Keep them
            </Button>
            <Button
              variant="primary"
              disabled={actions.pending}
              disabledReason="Working on it"
              onClick={() => {
                setAsking(false);
                if (videoToo) actions.run({ kind: "rerun", stage: "images" });
                else now?.confirm();
              }}
            >
              {`Make ${many} again`}
            </Button>
          </>
        }
      >
        {both ? (
          <div className="flex flex-col gap-1" {...helpScope}>
            <label className="flex items-center gap-2 text-small text-ink">
              <Checkbox
                checked={withVideo}
                onChange={(event) => setWithVideo(event.target.checked)}
              />
              Also make the video again with them (free)
            </label>
            <HelpLine>
              Without it, the video keeps the current pictures until you make it again.
            </HelpLine>
          </div>
        ) : null}
      </Dialog>
    </>
  );
}

// Make it again and Download on the lightbox's bar, for the picture shown full size, in words.
function OutputLightboxActions({
  output,
  name,
  thumbnail,
  actions,
  busy,
  sample,
}: {
  readonly output: Output;
  // "image 4", "thumbnail B", "the thumbnail".
  readonly name: string;
  readonly thumbnail: boolean;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  readonly sample: boolean;
}): ReactElement {
  const media = useOutputMedia(output);
  const change = useOutputChange(output, actions, busy);
  const copy =
    change.asking === undefined
      ? undefined
      : confirmationFor({
          kind: change.asking,
          outputId: output.id,
          now: change.now,
          thumbnail,
          price: change.price,
        });
  return (
    <>
      {sample ? null : (
        <Button
          size="small"
          disabled={change.unavailable}
          disabledReason="Wait until the work on this project is done"
          onClick={() => change.act("regenerate-image")}
        >
          <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
          {thumbnail ? `Make ${name} again` : "Make this image again"}
          {thumbnail ? null : <span className="sr-only"> for {name}</span>}
        </Button>
      )}
      {media === undefined ? null : (
        <FileLink href={media.url} download size="small">
          <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
          Download<span className="sr-only"> {name}</span>
        </FileLink>
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

// The establishing image, after the images it is never part of: labelled as the reference the
// others are drawn from, with Make it again when it was made from a prompt.
function ReferencePanel({
  image,
  format,
  generated,
  affected,
  actions,
  busy,
  sample,
}: {
  readonly image: Output | undefined;
  readonly format: Format;
  readonly generated: boolean;
  // How many images follow it, and so become outdated when it is made again.
  readonly affected: number;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  readonly sample: boolean;
}) {
  const media = useOutputMedia(image);
  const change = useOutputChange(image, actions, busy);
  const [open, setOpen] = useState<number | null>(null);
  const remakes = image !== undefined && generated && !sample;
  return (
    <section aria-label="Establishing image" className="flex min-w-0 flex-col gap-3">
      <SectionHead
        as="h3"
        title="Establishing image"
        meta="Not in the video: every image follows it for the look, palette and style"
        className="pb-0"
      >
        {remakes ? (
          <Button
            size="small"
            disabled={change.unavailable}
            disabledReason="Wait until the work on this project is done"
            onClick={() => change.act("regenerate-image")}
          >
            Make the establishing image again · 1 image call
          </Button>
        ) : null}
      </SectionHead>
      <MediaFrame
        className="w-full max-w-[360px]"
        alt={image?.meta.prompt ?? "Establishing image"}
        aspect={frameAspect(format)}
        {...(media === undefined ? {} : { src: media.url })}
        title="Establishing image"
        {...(image === undefined ? { meta: "Not made yet" } : {})}
        onOpen={() => setOpen(0)}
        openLabel="Open the establishing image full size"
        {...(image === undefined || media === undefined
          ? {}
          : {
              actions: (
                <FileLink href={media.url} download size="small">
                  <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                  Download<span className="sr-only"> the establishing image</span>
                </FileLink>
              ),
            })}
      />
      {remakes && affected > 0 ? (
        <p className="m-0 text-small text-ink-2">
          {`Making it again marks ${String(affected)} image${affected === 1 ? "" : "s"} outdated. They keep their current version until you make them again.`}
        </p>
      ) : null}
      <Lightbox
        items={
          media === undefined
            ? []
            : [
                {
                  src: media.url,
                  alt: "Establishing image",
                  caption: image?.meta.prompt ?? "The reference every image follows",
                },
              ]
        }
        index={open}
        onIndex={setOpen}
        onClose={() => setOpen(null)}
        actions={() =>
          media === undefined ? null : (
            <>
              {remakes ? (
                <Button
                  size="small"
                  disabled={change.unavailable}
                  disabledReason="Wait until the work on this project is done"
                  onClick={() => {
                    setOpen(null);
                    change.act("regenerate-image");
                  }}
                >
                  <RefreshCwIcon aria-hidden="true" strokeWidth={1.75} />
                  Make the establishing image again
                </Button>
              ) : null}
              <FileLink href={media.url} download size="small">
                <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                Download<span className="sr-only"> the establishing image</span>
              </FileLink>
            </>
          )
        }
      />
      <ConfirmDialog
        open={change.asking !== undefined}
        tone="primary"
        title="Make the establishing image again?"
        consequence={`${change.price === undefined ? "" : `${change.price} `}A new establishing image replaces this one${affected > 0 ? `, and the ${String(affected)} images drawn from it become outdated until you make them again` : ""}; the old one stays under Versions.`}
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
const imageGroupCap = 12;

function ImageGroup({
  name,
  count,
  showName,
  leading,
  trailing,
  children,
}: {
  readonly name: string;
  readonly count: number;
  readonly showName: boolean;
  // Tiles ahead of the group's own: the thumbnail, when it shares the images' grid.
  readonly leading?: ReactNode;
  readonly trailing?: ReactNode;
  readonly children: (limit: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const capped = count > imageGroupCap && !expanded;
  return (
    <section aria-label={`${name} × ${String(count)}`} className="flex flex-col gap-2">
      {showName ? <h3 className="sl-kicker m-0">{`${name} × ${String(count)}`}</h3> : null}
      <MediaGrid className={gridColumns}>
        {leading}
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
  sample,
  card = false,
  title,
  onOpen,
}: {
  readonly image: Output;
  // What tells this image from the others in its grid (`image-titles.ts`); the prompt otherwise.
  readonly title?: string | undefined;
  readonly projectId: string;
  // A card drawn from the article: made again from the article, never deleted on its own.
  readonly card?: boolean;
  // The automatic review's verdict on this image, when it had one.
  readonly review: Review | undefined;
  readonly format: Format;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
  // A read-only sample: nothing here may spend or change it.
  readonly sample: boolean;
  readonly onOpen: () => void;
}): ReactElement {
  const media = useOutputMedia(image);
  const number = numberOf(image);
  const name = card ? `on-screen card${number}` : `image${number}`;
  const change = useOutputChange(image, actions, busy);
  const outdated = useOutdated(image);
  const flagged = review !== undefined && !review.passed && review.action === null;
  const copy =
    change.asking === undefined
      ? undefined
      : confirmationFor({
          kind: change.asking,
          outputId: image.id,
          now: change.now,
          price: change.price,
        });
  return (
    <>
      <MediaFrame
        alt={card ? `On-screen card${number}` : (image.meta.prompt ?? `Slideshow ${name}`)}
        kind={isClip(image) ? "video" : "image"}
        aspect={frameAspect(format)}
        {...(media === undefined ? {} : { src: media.url })}
        title={card ? `Card${number}` : (title ?? image.meta.prompt ?? `Image${number}`)}
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
        actions={
          <>
            {flagged && review !== undefined ? (
              <ReviewActions review={review} projectId={projectId} busy={busy} />
            ) : null}
            {sample ? null : (
              <Button
                size="small"
                disabled={change.unavailable}
                disabledReason="Wait until the work on this project is done"
                onClick={() => change.act("regenerate-image")}
              >
                {card ? "Make this card again" : "Make this image again"}
                <span className="sr-only"> for {name}</span>
              </Button>
            )}
            {media === undefined ? null : (
              <FileLink href={media.url} download size="small">
                <DownloadIcon aria-hidden="true" strokeWidth={1.75} />
                Download<span className="sr-only"> {name}</span>
              </FileLink>
            )}
            <TileMore
              output={image}
              name={name}
              aspect={frameAspect(format)}
              replaceable={!card && !sample}
              disabled={change.unavailable}
              {...(card || sample ? {} : { onDelete: () => change.act("delete-image") })}
            />
          </>
        }
      />
      <ConfirmDialog
        open={change.asking !== undefined}
        tone={change.asking === "delete-image" ? "destructive" : "primary"}
        title={copy?.title ?? ""}
        consequence={copy?.consequence ?? ""}
        confirmLabel={change.asking === "delete-image" ? "Delete the image" : (copy?.verb ?? "")}
        cancelLabel="Keep it"
        pending={actions.pending}
        onConfirm={change.confirm}
        onCancel={change.dismiss}
      />
    </>
  );
}
