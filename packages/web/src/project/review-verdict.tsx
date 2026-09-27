import { reviewStageLabels } from "@app/slices/reviews/model.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactElement, useState } from "react";
import type { ProjectBody } from "@/api";
import { useApp } from "@/app-context";
import { Button } from "@/components/kit/button";
import { InfoTip } from "@/components/kit/info-tip";
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
  if (review.passed)
    return review.attempt > 1
      ? { label: "Redone after review", tone: "info" }
      : { label: "Review passed", tone: "neutral" };
  if (review.action === "overruled") return { label: "Accepted by you", tone: "neutral" };
  if (review.action === "redone") return { label: "Being made again", tone: "running" };
  if (review.redoState === "pending" || review.redoState === "started")
    return { label: "Being made again", tone: "running" };
  return { label: "Flagged by review", tone: "info" };
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
        <p className="m-0">The reviewer found nothing to fix.</p>
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
  const moving = review.redoState === "pending" || review.redoState === "started";
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Button
        variant="quiet"
        size="small"
        disabled={busy || moving || act.isPending}
        disabledReason="Wait until the work on this project is done"
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

// Beside a large item (the article, the narration, the thumbnail, a short): the status, the
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
      <InfoTip label="this review">
        <Reasons review={review} />
      </InfoTip>
    </span>
  );
}
