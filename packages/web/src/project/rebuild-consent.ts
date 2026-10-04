import type { RebuildPreview } from "@app/slices/rebuild/model.js";

// A preview that can start without asking anything: nothing blocked, no provided content
// to confirm and every cost known.
export function needsNoConsent(preview: RebuildPreview): boolean {
  return (
    !preview.work.some((work) => work.disposition === "blocked") &&
    preview.providedReuseRequired.length === 0 &&
    preview.costs.unknown === 0
  );
}

// Whether a remake may start straight from the button that asked for it. Only work that
// charges nothing does: no provider call (a CLI plan's call still uses its limits) and a
// known total of $0, which in practice is rebuilding on this computer. A charge the person
// already saw and accepted at the button (`approvedUpTo`) also starts, if the estimate is no
// higher. Anything else opens the review with its scope and cost, one press from starting.
export function startsWithoutReview(preview: RebuildPreview, approvedUpTo?: number): boolean {
  if (!needsNoConsent(preview)) return false;
  const paid =
    preview.costs.high > 0 ||
    preview.work.some((work) => work.disposition === "generate" && work.kind === "provider");
  if (!paid) return true;
  return approvedUpTo !== undefined && preview.costs.high <= approvedUpTo;
}
