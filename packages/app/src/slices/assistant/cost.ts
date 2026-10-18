import { z } from "zod";
import type { CostEstimate } from "../estimate/index.js";

// The cost sentence on an ask card, from the estimate the preview (Choose what to remake) or
// Play's review already showed for this exact work.

const money = (value: number): string => `$${value.toFixed(2)}`;

function range(low: number, high: number): string {
  return Math.abs(high - low) < 0.005 ? money(low) : `${money(low)}–${money(high)}`;
}

export type PricedWork = Pick<CostEstimate, "low" | "high" | "unknown" | "apiLow">;

export function costSentence(estimates: readonly PricedWork[]): string {
  const low = estimates.reduce((sum, one) => sum + one.low, 0);
  const high = estimates.reduce((sum, one) => sum + one.high, 0);
  const unknown = estimates.reduce((sum, one) => sum + one.unknown, 0);
  const onPlan = estimates.some((one) => one.apiLow !== undefined);
  const priced = high > 0 ? `estimated at ${range(low, high)}` : onPlan ? "" : "estimated at $0.00";
  const plan = onPlan ? "part of it runs on your CLI plan's allowance" : "";
  const unpriced =
    unknown === 0
      ? ""
      : `${String(unknown)} ${unknown === 1 ? "step has" : "steps have"} no price in the catalogue`;
  const parts = [priced, plan, unpriced].filter((part) => part !== "");
  return `This starts paid work${parts.length === 0 ? "" : `: ${parts.join("; ")}`}.`;
}

export const unpricedSentence = "This starts paid work; Slopify can't price it here.";

const costsSchema = z
  .object({
    currency: z.literal("USD"),
    low: z.number(),
    high: z.number(),
    unknown: z.number(),
    apiLow: z.number().optional(),
  })
  .loose();

// The estimate a preview_rebuild or review_draft answer carries, keyed by the id the start
// call names (previewId, reviewId).
export function estimateOfAnswer(
  value: unknown,
): { readonly id: string; readonly estimates: readonly PricedWork[] } | undefined {
  const preview = z.object({ id: z.string(), costs: costsSchema }).safeParse(value);
  if (preview.success) return { id: preview.data.id, estimates: [preview.data.costs] };
  const review = z.object({ id: z.string(), estimates: z.array(costsSchema) }).safeParse(value);
  if (review.success) return { id: review.data.id, estimates: review.data.estimates };
  return undefined;
}
