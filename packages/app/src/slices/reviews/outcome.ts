import type { ReviewMode, ReviewOutcome, ReviewRecord } from "./model.js";

// Which try at the item this review looks at. A redo Slopify started itself carries the
// count on; anything else (a first review, an item the person changed or had made again)
// starts at one. The same output reviewed again keeps its number.
export function nextAttempt(
  previous:
    | Pick<ReviewRecord, "attempt" | "outcome" | "itemFingerprint" | "action" | "redoState">
    | undefined,
  itemFingerprint: string,
): number {
  if (previous === undefined) return 1;
  if (previous.itemFingerprint === itemFingerprint) return previous.attempt;
  if (previous.outcome === "redo" && previous.action === null && previous.redoState !== "failed")
    return previous.attempt + 1;
  return 1;
}

// A pass is a pass. A fail is flagged, or sent back to be made again while its retries last:
// with two retries the first and second tries are redone and the third is kept and flagged,
// so a stubborn item never loops.
export function reviewOutcome(input: {
  readonly passed: boolean;
  readonly mode: Exclude<ReviewMode, "off">;
  readonly attempt: number;
  readonly retries: number;
}): ReviewOutcome {
  if (input.passed) return "passed";
  if (input.mode === "flag") return "flagged";
  return input.attempt <= input.retries ? "redo" : "flagged";
}
