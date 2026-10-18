import { reviewStageLabels } from "@app/slices/reviews/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { InfoIcon } from "lucide-react";
import { type ReactElement, useState } from "react";
import type { ProjectBody } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/kit/popover";
import { Badge, type BadgeTone } from "@/components/kit/status";
import { keys } from "@/queries";
import { actOnReview, listReviews, type Review, reviewsKey } from "./review-api.js";

// The project's review verdicts: each reviewed item's latest one, kept fresh by the live
// subscription (`use-live.ts` refetches it with the project).
export function useReviews(projectId: string): readonly Review[] {
  const { api } = useApp();
  const reviews = useQuery({
    queryKey: reviewsKey(projectId),
    queryFn: () => listReviews(api, projectId),
  });
  return (reviews.data ?? []).filter((review) => review.current);
}

export function reviewFor(
  reviews: readonly Review[],
  item: { readonly itemKey?: string; readonly outputId?: string | undefined },
): Review | undefined {
  return reviews.find((review) =>
    item.itemKey !== undefined
      ? review.itemKey === item.itemKey
      : item.outputId !== undefined && review.outputId === item.outputId,
  );
}

function statusOf(review: Review): {
  readonly label: string;
  readonly tone: BadgeTone;
} {
  const agent = review.answeredBy === "agent";
  if (review.outcome === "auto-passed") return { label: "Passed without review", tone: "waiting" };
  if (review.passed)
    return review.attempt > 1
      ? { label: agent ? "Redone after agent review" : "Redone after review", tone: "info" }
      : { label: agent ? "Passed by agent" : "Review passed", tone: "neutral" };
  if (review.action === "overruled")
    return {
      label:
        review.actionBy === "person" || review.actionBy === null
          ? "Accepted by you"
          : `Accepted by ${review.actionBy}`,
      tone: "neutral",
    };
  if (review.action === "redone")
    return {
      label:
        review.actionBy === "person" || review.actionBy === null
          ? "Being made again"
          : `Made again by ${review.actionBy}`,
      tone: "running",
    };
  if (review.redoState === "pending") return { label: "Waiting to be made again", tone: "running" };
  if (review.redoState === "started") return { label: "Being made again", tone: "running" };
  return { label: agent ? "Flagged by agent" : "Flagged by review", tone: "info" };
}

// The verdict as a status badge: "Flagged by review", "Redone after review".
export function ReviewBadge({ review }: { readonly review: Review }): ReactElement {
  const status = statusOf(review);
  return <Badge tone={status.tone}>{status.label}</Badge>;
}

function Chip({ review }: { readonly review: Review }): ReactElement {
  return <ReviewBadge review={review} />;
}

function Reasons({ review }: { readonly review: Review }): ReactElement {
  return (
    <>
      {review.reasons.length === 0 ? (
        <p className="m-0">
          {review.outcome === "auto-passed"
            ? "No agent answered within 2 hours, so it went ahead without review."
            : "The reviewer found nothing to fix."}
        </p>
      ) : (
        <ul className="m-0 flex list-disc flex-col gap-1 pl-4">
          {review.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      <p className="m-0 text-ink-3">
        {review.outcome === "flagged" && !review.passed && review.attempt > 1
          ? `Kept after ${String(review.attempt)} tries: the redo limit was reached.`
          : `Try ${String(review.attempt)}.`}
      </p>
      {review.redoState === "failed" && review.redoError ? (
        <p className="m-0 text-danger">{review.redoError}</p>
      ) : null}
    </>
  );
}

// Overrule (accept anyway) and Redo (make it again, through Re-run's path). Shown while the
// verdict is a failure nobody has acted on; disabled, not removed, while a redo is under way.
// A redo still waiting to start can be called off with Overrule.
export function ReviewActions({
  review,
  projectId,
  busy,
}: {
  readonly review: Review;
  readonly projectId: string;
  readonly busy: boolean;
}): ReactElement | null {
  const { api } = useApp();
  const client = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const act = useMutation({
    mutationFn: async (action: "overrule" | "redo") => {
      const revisionId = client.getQueryData<ProjectBody>(keys.project(projectId))?.revisionId;
      return actOnReview(
        api,
        projectId,
        review.id,
        action,
        action === "redo" && revisionId
          ? { baseRevisionId: revisionId, idempotencyKey: crypto.randomUUID() }
          : undefined,
      );
    },
    onSuccess: async (reply) => {
      setMessage(reply.ok ? null : reply.message);
      await client.invalidateQueries({ queryKey: reviewsKey(projectId) });
      await client.invalidateQueries({ queryKey: keys.project(projectId) });
    },
    onError: (error) => setMessage(error.message),
  });
  if (review.passed || review.action !== null) return null;
  const waiting = review.redoState === "pending";
  const moving = waiting || review.redoState === "started";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button
        variant="quiet"
        size="small"
        disabled={(busy && !waiting) || review.redoState === "started" || act.isPending}
        disabledReason={
          review.redoState === "started"
            ? "Slopify is already making this item again; wait for the new version"
            : "Wait until the work on this project is done"
        }
        onClick={() => act.mutate("overrule")}
      >
        Overrule
      </Button>
      <Button
        variant="quiet"
        size="small"
        disabled={busy || moving || act.isPending}
        disabledReason="Wait until the work on this project is done"
        onClick={() => act.mutate("redo")}
      >
        Redo
      </Button>
      {message ? (
        <span role="alert" className="basis-full text-small text-danger">
          {message}
        </span>
      ) : null}
    </span>
  );
}

// Beside a large item (the article and its promise check, the narration, the thumbnail, a
// short): the status, the
// reasons and the two actions in one row.
export function ReviewVerdict({
  review,
  projectId,
  busy,
}: {
  readonly review: Review | undefined;
  readonly projectId: string;
  readonly busy: boolean;
}): ReactElement | null {
  if (review === undefined) return null;
  return (
    <section
      aria-label={`${reviewStageLabels[review.stage]} review`}
      className="flex min-w-0 flex-col gap-1 text-small"
    >
      <div className="flex flex-wrap items-center gap-2">
        {/* It sits under the article's own review, so it says which one it is. */}
        {review.stage === "promise" ? <span className="font-medium">Promise check</span> : null}
        <Chip review={review} />
        <ReviewActions review={review} projectId={projectId} busy={busy} />
      </div>
      <div className="flex flex-col gap-1 text-ink-2">
        <Reasons review={review} />
      </div>
    </section>
  );
}

// On a media frame's corner: the status, with the reasons behind a press so the grid stays a
// grid. Overrule and Redo sit with the frame's other actions.
export function ReviewChip({
  review,
}: {
  readonly review: Review | undefined;
}): ReactElement | null {
  if (review === undefined) return null;
  if (review.passed && review.attempt <= 1) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Chip review={review} />
      {/* The reviewer's own reasons, so not a catalogue tip: the same press opens them. */}
      <Popover>
        <PopoverTrigger
          type="button"
          aria-label="About this review"
          className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-raised hover:text-ink"
        >
          <InfoIcon aria-hidden="true" className="size-[15px]" />
        </PopoverTrigger>
        <PopoverContent className="space-y-2 leading-[1.45]">
          <Reasons review={review} />
        </PopoverContent>
      </Popover>
    </span>
  );
}
