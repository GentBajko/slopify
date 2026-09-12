import { z } from "zod";
import { transact } from "../../kernel/db/tx.js";
import { isMissingFont } from "../fonts/index.js";
import type { ResolvedFont } from "../fonts/model.js";
import type {
  DraftResult,
  DraftReviewDeps,
  DraftView,
  PlayReview,
  ResolvedPlayReview,
} from "./model.js";
import { draftRow } from "./repo.js";
import { resolveReviewInputs, reviewBinding, reviewRefusal } from "./review-inputs.js";
import { draftViewSchema, playReviewSchema } from "./schema.js";
import { readDraft } from "./service.js";

export { resolveReviewInputs } from "./review-inputs.js";
export async function resolvePlayReview(
  deps: DraftReviewDeps,
  view: DraftView,
): Promise<DraftResult<ResolvedPlayReview>> {
  const parsed = draftViewSchema.safeParse(view);
  if (!parsed.success)
    return { ok: false, reason: "invalid-edit", currentVersion: null, fields: [] };
  const before = resolveReviewInputs(deps, parsed.data, null);
  if (!before.ok) return before;
  let font: ResolvedFont | null = null;
  const subtitles = before.value.runs[0]?.draft.subtitles;
  if (subtitles !== undefined && subtitles.mode !== "off") {
    try {
      font = await deps.resolveFont(subtitles.fontId);
    } catch (error) {
      if (!isMissingFont(error)) throw error;
      return reviewRefusal(view, [
        {
          field: "subtitles.fontId",
          message: "The selected font is no longer available. Choose another font.",
        },
      ]);
    }
  }
  const after = resolveReviewInputs(deps, parsed.data, font);
  if (!after.ok) return after;
  return reviewBinding(before.value) === reviewBinding(after.value)
    ? after
    : reviewRefusal(view, [], "stale-review");
}
const inputSchema = z.object({ id: z.uuid(), baseVersion: z.number().int().positive() }).strict();
export async function reviewDraft(
  deps: DraftReviewDeps,
  input: { readonly id: string; readonly baseVersion: number },
): Promise<DraftResult<PlayReview>> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success)
    return { ok: false, reason: "invalid-edit", currentVersion: null, fields: [] };
  const view = readDraft(deps, parsed.data.id);
  if (!view.ok) return view;
  const gate = reviewGate(view.value, parsed.data.baseVersion);
  if (gate !== null) return gate;
  const resolved = await resolvePlayReview(deps, view.value);
  if (!resolved.ok) return resolved;
  return transact(deps.db, () => {
    const current = readDraft(deps, parsed.data.id);
    if (!current.ok) return current;
    const denied = reviewGate(current.value, parsed.data.baseVersion);
    if (denied !== null) return denied;
    const final = resolveReviewInputs(deps, current.value, resolved.value.font);
    if (!final.ok) return final;
    if (final.value.fingerprint !== resolved.value.fingerprint)
      return reviewRefusal(current.value, [], "stale-review");
    const old = current.value.review;
    if (
      old?.draftVersion === current.value.draft.version &&
      old.fingerprint === final.value.fingerprint
    )
      return { ok: true, value: old };
    const review = playReviewSchema.parse({
      id: deps.uuid(),
      draftId: parsed.data.id,
      draftVersion: parsed.data.baseVersion,
      fingerprint: final.value.fingerprint,
      runs: final.value.runs,
      estimates: final.value.estimates,
    });
    const { catalogue, attachmentIdentity, font } = final.value;
    const changed = deps.db
      .prepare(
        "UPDATE play_drafts SET review_id=?,review_json=?,review_fingerprint=? WHERE id=? AND version=? AND state='active'",
      )
      .run(
        review.id,
        JSON.stringify({ review, execution: { catalogue, attachmentIdentity, font } }),
        review.fingerprint,
        parsed.data.id,
        parsed.data.baseVersion,
      );
    if (Number(changed.changes) !== 1)
      return {
        ok: false,
        reason: "conflict",
        currentVersion: draftRow(deps.db, parsed.data.id)?.version ?? null,
        fields: [],
      };
    return { ok: true, value: review };
  });
}
function reviewGate(
  view: DraftView,
  baseVersion: number,
): Extract<DraftResult<never>, { ok: false }> | null {
  if (view.pendingStart !== null)
    return {
      ok: false,
      reason: "pending-start",
      currentVersion: view.draft.version,
      reviewId: view.pendingStart.reviewId,
      fields: [],
    };
  if (view.start !== null)
    return { ok: false, reason: "already-started", currentVersion: view.draft.version, fields: [] };
  if (view.draft.version !== baseVersion)
    return { ok: false, reason: "conflict", currentVersion: view.draft.version, fields: [] };
  return null;
}
