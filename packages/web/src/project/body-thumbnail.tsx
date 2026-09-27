import { type ProjectSummary, type Stage, thumbnailCountOf } from "@app/slices/admission/model.js";
import type { Output } from "@app/slices/storage/model.js";
import { useId } from "react";
import { cn } from "@/lib/utils";
import type { BodyProps } from "./body.js";
import { outputsOf, roleOf } from "./body.js";
import { ConfirmedButton } from "./controls.js";
import { ActionRow, OutputDownload } from "./parts.js";
import type { Review } from "./review-api.js";
import { ReviewVerdict, reviewFor, useReviews } from "./review-verdict.js";
import { useOutputMedia } from "./revision-media.js";

// The thumbnail at the top of the Images section: the picture itself, large, with Regenerate
// and its download; or, when the project makes three, the three side by side, each with its
// own Regenerate. The prompt behind it is not shown; the picture is what gets judged.
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
}) {
  const id = useId();
  const own = outputsOf(outputs, stage);
  const image = roleOf(own, "thumbnail");
  const media = useOutputMedia(image);
  const tall = project.format === "9:16";
  const reviews = useReviews(project.id);
  const count = thumbnailCountOf(project.config);
  const regenerateAll = (
    <ConfirmedButton
      action={{ kind: "rerun", stage: stage.kind }}
      run={() => {
        actions.run({ kind: "rerun", stage: stage.kind });
      }}
      disabled={busy || stage.state === "pending"}
      pending={actions.pending}
    >
      {count === 1 ? "Regenerate thumbnail" : "Regenerate all thumbnails"}
    </ConfirmedButton>
  );
  if (count > 1)
    return (
      <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-[10px]">
        <h3 id={`${id}-title`} className="engraved text-ink3">
          Thumbnails
        </h3>
        {/* Side by side for comparing, as Test & compare will; each is made again on its own. */}
        <ul className={cn("grid gap-3", tall ? "grid-cols-3 max-w-[720px]" : "sm:grid-cols-3")}>
          {Array.from({ length: count }, (_, index) => index + 1).map((variant) => (
            <ThumbnailVariant
              key={variant}
              variant={variant}
              output={own.find(
                (output) => output.role === "thumbnail" && (output.meta.index ?? 1) === variant,
              )}
              review={reviewFor(reviews, {
                outputId: own.find(
                  (output) => output.role === "thumbnail" && (output.meta.index ?? 1) === variant,
                )?.id,
              })}
              stage={stage}
              project={project}
              actions={actions}
              busy={busy}
            />
          ))}
        </ul>
        <ActionRow>{regenerateAll}</ActionRow>
      </section>
    );
  return (
    <section aria-labelledby={`${id}-title`} className="flex min-w-0 flex-col gap-[10px]">
      <h3 id={`${id}-title`} className="engraved text-ink3">
        Thumbnail
      </h3>
      {/* The frame is drawn before the picture lands, so nothing below it moves when it does. */}
      <div
        className={cn(
          "w-full overflow-hidden rounded-control border border-line bg-panel2",
          tall ? "aspect-[9/16] max-w-[320px]" : "aspect-video max-w-[720px]",
        )}
      >
        {image === undefined ? (
          <p className="flex h-full items-center justify-center p-4 text-center text-small text-ink2">
            {missing(stage)}
          </p>
        ) : (
          <img
            src={media?.url}
            alt={`Thumbnail for ${project.title}`}
            className="block size-full object-cover animate-tick-in motion-reduce:animate-none"
          />
        )}
      </div>
      <ReviewVerdict
        review={reviewFor(reviews, { outputId: image?.id })}
        projectId={project.id}
        busy={busy}
      />
      <ActionRow>
        {regenerateAll}
        {image === undefined ? null : <OutputDownload output={image} label="Download thumbnail" />}
      </ActionRow>
    </section>
  );
}

// One of three thumbnails: its frame, its own Regenerate and its download, always visible.
function ThumbnailVariant({
  variant,
  output,
  review,
  stage,
  project,
  actions,
  busy,
}: {
  readonly variant: number;
  readonly output: Output | undefined;
  // The automatic review's verdict on this thumbnail, when it had one.
  readonly review: Review | undefined;
  readonly stage: Stage;
  readonly project: ProjectSummary;
  readonly actions: BodyProps["actions"];
  readonly busy: boolean;
}) {
  const media = useOutputMedia(output);
  const tall = project.format === "9:16";
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div
        className={cn(
          "w-full overflow-hidden rounded-control border border-line bg-panel2",
          tall ? "aspect-[9/16]" : "aspect-video",
        )}
      >
        {output === undefined ? (
          <p className="flex h-full items-center justify-center p-2 text-center text-small text-ink2">
            {missing(stage)}
          </p>
        ) : (
          <img
            src={media?.url}
            alt={`Thumbnail ${String(variant)} for ${project.title}`}
            className="block size-full object-cover animate-tick-in motion-reduce:animate-none"
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="text-small font-semibold text-ink2">{`Thumbnail ${String(variant)}`}</span>
        {output === undefined ? null : (
          <ConfirmedButton
            action={{ kind: "regenerate-image", outputId: output.id }}
            run={() => {
              actions.run({ kind: "regenerate-image", outputId: output.id });
            }}
            disabled={busy}
            pending={actions.pending}
            variant="ghost"
          >
            Regenerate
          </ConfirmedButton>
        )}
        {output === undefined ? null : (
          <OutputDownload output={output} label={`Download ${String(variant)}`} />
        )}
      </div>
      <ReviewVerdict review={review} projectId={project.id} busy={busy} />
    </li>
  );
}

function missing(stage: Stage): string {
  switch (stage.state) {
    case "running":
      return "Making the thumbnail…";
    case "failed":
    case "canceled":
      return "No thumbnail was made. Use Retry thumbnail above to try again.";
    default:
      return "No thumbnail has landed yet.";
  }
}
