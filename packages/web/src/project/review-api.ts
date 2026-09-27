import { reviewStages } from "@app/slices/reviews/model.js";
import type { ReviewView } from "@app/slices/reviews/view.js";
import { z } from "zod";
import type { Api } from "@/api";
import { errorOf, understood } from "@/http";

const reviewSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  revisionId: z.string(),
  itemKey: z.string(),
  stage: z.enum(reviewStages),
  itemFingerprint: z.string(),
  reviewFingerprint: z.string(),
  passed: z.boolean(),
  reasons: z.array(z.string()),
  outcome: z.enum(["passed", "flagged", "redo"]),
  attempt: z.number(),
  action: z.enum(["overruled", "redone"]).nullable(),
  actionAt: z.string().nullable(),
  redoState: z.enum(["pending", "started", "failed"]).nullable(),
  redoError: z.string().nullable(),
  createdAt: z.string(),
  current: z.boolean(),
  outputId: z.string().nullable(),
  verdicts: z.number(),
}) satisfies z.ZodType<ReviewView>;
export type Review = z.infer<typeof reviewSchema>;

export const reviewsKey = (projectId: string): readonly string[] => ["reviews", projectId];

export type ReviewReply = { readonly ok: true } | { readonly ok: false; readonly message: string };

const problemSchema = z.object({ title: z.string(), detail: z.string().optional() });

export async function listReviews(api: Api, projectId: string): Promise<readonly Review[]> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}/reviews`,
  );
  if (!response.ok) throw errorOf(response, undefined);
  return understood(z.object({ reviews: z.array(reviewSchema) }), await response.json()).reviews;
}

// Overrule and Redo. A refusal the server explains is shown beside the verdict; anything
// else is a fault.
export async function actOnReview(
  api: Api,
  projectId: string,
  verdictId: string,
  action: "overrule" | "redo",
  control?: { readonly baseRevisionId: string; readonly idempotencyKey: string },
): Promise<ReviewReply> {
  const response = await api.fetch(
    `${api.origin}/api/projects/${encodeURIComponent(projectId)}/reviews/${encodeURIComponent(verdictId)}/${action}`,
    {
      method: "POST",
      ...(control === undefined
        ? {}
        : { headers: { "content-type": "application/json" }, body: JSON.stringify(control) }),
    },
  );
  if (response.ok) return { ok: true };
  let raw: unknown;
  try {
    raw = await response.json();
  } catch {
    throw errorOf(response, undefined);
  }
  const problem = problemSchema.safeParse(raw);
  if (!problem.success || ![400, 404, 409, 503].includes(response.status))
    throw errorOf(response, undefined);
  return { ok: false, message: problem.data.detail ?? problem.data.title };
}
