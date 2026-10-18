import type { Catalogue } from "../../catalog/schema.js";
import type { CostEstimate } from "../estimate/index.js";
import { estimateRequests } from "../estimate/requests.js";

// What one paid picture of a design costs: an edit (which sends pictures, so its price is a
// range) or the artwork. Quoting records nothing.
export function quoteDesignImage(
  catalogue: Catalogue,
  request: {
    readonly provider: string;
    readonly model: string;
    readonly purpose: "picture-edit" | "design-art";
    readonly sendsPictures: boolean;
  },
): CostEstimate {
  return estimateRequests(
    [
      {
        kind: "image",
        provider: request.provider,
        model: request.model,
        stage: request.purpose === "picture-edit" ? "Picture edit" : "Artwork",
        variable: request.sendsPictures,
      },
    ],
    catalogue,
  );
}

// A paid step starts only when what it costs now is no more than what the person was shown,
// give or take half a cent of rounding, and a price nobody knows only once they accepted that.
export function costChanged(
  quote: CostEstimate,
  acknowledgedHigh: number,
  acknowledgedUnknown = false,
): boolean {
  return quote.high > acknowledgedHigh + 0.005 || (quote.unknown > 0 && !acknowledgedUnknown);
}

export function costChangedMessage(quote: CostEstimate, what: string): string {
  if (quote.unknown > 0)
    return `The price changed since you looked: ${what} has no known price now, so nothing was started. Check the button, which says the price is unknown, and press it again to make it anyway.`;
  return `The price changed since you looked: ${what} now costs up to $${quote.high.toFixed(2)}. Check the new price on the button and press it again.`;
}
