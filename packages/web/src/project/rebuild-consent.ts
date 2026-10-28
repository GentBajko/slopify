import type { RebuildPreview } from "@app/slices/rebuild/model.js";

// What the person accepted at the button that asked for a remake: the amount its dialog
// showed, or that the price isn't known in advance.
export interface ButtonConsent {
  readonly approvedUpTo?: number | undefined;
  readonly unknownPrices?: boolean | undefined;
}

// Whether a remake may start straight from the button that asked for it. Work that charges
// nothing does: no provider call (a CLI plan's call still uses its limits) and a known total
// of $0, which in practice is rebuilding on this computer. A charge the person already saw and
// accepted at the button (`approvedUpTo`) also starts, if the estimate is no higher; so does a
// call whose dialog said its price isn't known, which the start acknowledges. Anything else,
// and anything blocked or supplied by the person, opens the review with its scope and cost.
export function startsWithoutReview(preview: RebuildPreview, consent: ButtonConsent = {}): boolean {
  if (
    preview.work.some((work) => work.disposition === "blocked") ||
    preview.providedReuseRequired.length > 0
  )
    return false;
  const unknown = consent.unknownPrices === true;
  if (preview.costs.unknown > 0 && !unknown) return false;
  const paid =
    preview.costs.high > 0 ||
    preview.work.some((work) => work.disposition === "generate" && work.kind === "provider");
  if (!paid) return true;
  if (consent.approvedUpTo !== undefined) return preview.costs.high <= consent.approvedUpTo;
  return unknown;
}
