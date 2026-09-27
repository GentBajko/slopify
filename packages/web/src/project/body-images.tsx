import type { Format } from "@app/kernel/pipeline.js";
import type { Output } from "@app/slices/storage/model.js";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ThumbnailPanel } from "./body-thumbnail.js";
import { ConfirmedButton } from "./controls.js";
import { groupImages } from "./image-groups.js";
import { ActionRow, DownloadLink, EngravedLabel, OutputDownload, StageBody } from "./parts.js";
import type { Review } from "./review-api.js";
import { ReviewActions, ReviewChip, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia } from "./revision-media.js";

// Images: a grid per image prompt, 6 columns at 1440 px, prompt name as an engraved header with
// '× N'; per image on hover and focus: Download, Regenerate, Delete; 'Download all' and 'Re-run
// stage' at the group's right. The thumbnail, when the run makes one, sits large above them all;
// with Images switched off it is the section's only content.

export function aspectOf(format: Format): string {
  return format === "9:16" ? "aspect-[9/16]" : "aspect-video";
}

export function ImagesBody({ stage, companion, project, outputs, actions, busy }: BodyProps) {
  const reviews = useReviews(project.id);
  const groups = groupImages(
    outputsOf(outputs, stage),
    project.config.imagePrompts?.map((prompt) => prompt.name) ?? [],
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
  if (stage.state === "skipped") return <StageBody>{thumbnail}</StageBody>;

  return (
    <StageBody>
      {thumbnail}
      {thumbnail === null ? null : (
        <h3 className="engraved border-t border-line pt-4 text-ink3">Slideshow images</h3>
      )}
      <ActionRow>
        <ConfirmedButton
          action={{ kind: "rerun", stage: stage.kind }}
          run={() => {
            actions.run({ kind: "rerun", stage: stage.kind });
          }}
          disabled={busy || stage.state === "pending"}
          pending={actions.pending}
        >
          Re-run stage
        </ConfirmedButton>
        <DownloadLink projectId={project.id} asset="images.zip" label="Download all" />
      </ActionRow>

      {groups.length === 0 ? (
        <p className="text-small text-ink2">No images have landed yet.</p>
      ) : null}

      {groups.map((group) => (
        <ImageGroup key={group.name} name={group.name} count={group.images.length}>
          {(limit) =>
            group.images
              .slice(0, limit)
              .map((image) => (
                <ImageTile
                  key={image.id}
                  image={image}
                  projectId={project.id}
                  review={reviewFor(reviews, { outputId: image.id })}
                  format={project.format}
                  actions={actions}
                  busy={busy}
                />
              ))
          }
        </ImageGroup>
      ))}
      {project.config.reference === undefined ? null : (
        <ReferencePanel
          image={roleOf(outputsOf(outputs, stage), "reference")}
          format={project.format}
          generated={project.config.reference.source === "prompt"}
          actions={actions}
          busy={busy}
        />
      )}
    </StageBody>
  );
}

// The establishing image, under the slideshow it is never part of: labelled as the reference
// the other images are drawn from, with Regenerate when it was made from a prompt.
function ReferencePanel({
  image,
  format,
  generated,
  actions,
  busy,
}: {
  readonly image: Output | undefined;
  readonly format: Format;
  readonly generated: boolean;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const media = useOutputMedia(image);
  return (
    <section aria-label="Establishing image" className="flex flex-col gap-[10px]">
      <EngravedLabel>Establishing image · reference, not in the video</EngravedLabel>
      <div className="grid grid-cols-3 gap-2 min-[900px]:grid-cols-6">
        <figure className="m-0 overflow-hidden rounded-control border border-line bg-panel2">
          {image === undefined ? (
            <p
              className={cn(
                "flex items-center justify-center p-2 text-center text-label text-ink2",
                aspectOf(format),
              )}
            >
              Not made yet
            </p>
          ) : (
            <img
              src={media?.url}
              alt={image.meta.prompt ?? "Establishing image"}
              className={cn("block w-full object-cover", aspectOf(format))}
            />
          )}
        </figure>
      </div>
      <ActionRow>
        {image !== undefined && generated ? (
          <ConfirmedButton
            action={{ kind: "regenerate-image", outputId: image.id }}
            run={() => {
              actions.run({ kind: "regenerate-image", outputId: image.id });
            }}
            disabled={busy}
            pending={actions.pending}
          >
            Regenerate establishing image
          </ConfirmedButton>
        ) : null}
        {image === undefined ? null : (
          <OutputDownload output={image} label="Download establishing image" />
        )}
      </ActionRow>
    </section>
  );
}

// Two rows of six, then "Show all": a group of sixty images no longer turns the Output tab
// into a page of several thousand pixels. The cap is the reader's to lift.
export const imageGroupCap = 12;

function ImageGroup({
  name,
  count,
  children,
}: {
  readonly name: string;
  readonly count: number;
  readonly children: (limit: number) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  const capped = count > imageGroupCap && !expanded;
  return (
    <section className="flex flex-col gap-[10px]">
      <EngravedLabel>{`${name} × ${String(count)}`}</EngravedLabel>
      <div className="grid grid-cols-3 gap-2 min-[900px]:grid-cols-6">
        {children(capped ? imageGroupCap : count)}
      </div>
      {count > imageGroupCap ? (
        <Button
          variant="ghost"
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
}: {
  readonly image: Output;
  readonly projectId: string;
  // The automatic review's verdict on this image, when it had one.
  readonly review: Review | undefined;
  readonly format: Format;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const media = useOutputMedia(image);
  const place = image.meta.index === undefined ? "" : ` ${String(image.meta.index)}`;

  return (
    <figure className="group relative m-0 overflow-hidden rounded-control border border-line bg-panel2">
      {/\.(mp4|mov|m4v|webm|mkv)$/i.test(image.path) ? (
        // An uploaded clip in an image's place, played muted as the video will.
        <video
          src={media?.url}
          muted
          loop
          controls
          preload="metadata"
          aria-label={`Video clip${place}`}
          className={cn("block w-full object-cover", aspectOf(format))}
        />
      ) : (
        <img
          src={media?.url}
          loading="lazy"
          alt={image.meta.prompt ?? `Slideshow image${place}`}
          // The image fades in as it lands, which is the grid's whole motion budget.
          className={cn(
            "block w-full object-cover animate-tick-in motion-reduce:animate-none",
            aspectOf(format),
          )}
        />
      )}
      <ReviewChip review={review} />
      {/* Revealed by hover and by focus alike, and always in the tab order, so nothing
          here is hover-only information. */}
      <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-1 bg-panel/90 p-1 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 motion-reduce:transition-none">
        <OutputDownload output={image} />
        {review === undefined ? null : (
          <ReviewActions review={review} projectId={projectId} busy={busy} />
        )}
        <ConfirmedButton
          action={{ kind: "regenerate-image", outputId: image.id }}
          run={() => {
            actions.run({ kind: "regenerate-image", outputId: image.id });
          }}
          disabled={busy}
          pending={actions.pending}
          variant="ghost"
        >
          Regenerate
        </ConfirmedButton>
        <ConfirmedButton
          action={{ kind: "delete-image", outputId: image.id }}
          run={() => {
            actions.run({ kind: "delete-image", outputId: image.id });
          }}
          disabled={busy}
          pending={actions.pending}
          variant="ghost"
        >
          Delete
        </ConfirmedButton>
      </figcaption>
    </figure>
  );
}
