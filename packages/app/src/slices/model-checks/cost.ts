import { type Catalogue, isVideoModel } from "../../catalog/schema.js";
import type { ProviderUse } from "../../kernel/runner/meter.js";
import { priceCall } from "../run-cost/pricing.js";
import { isLocalCliProvider, systemVoiceProvider } from "../settings/model.js";
import type { CheckCost, ModelKey } from "./model.js";

// ceiling: an automatic check may cost at most this much per call (decision 1). Anything
// dearer - and every image - waits for Check models and a confirmed estimate.
export const automaticCeilingDollars = 0.001;

// What a check is assumed to use before it runs: a short prompt and a one-word reply, two
// characters of speech, one small image.
const assumed = { tokensIn: 40, tokensOut: 40, characters: 2, images: 1 } as const;

export function isVideoTarget(catalogue: Catalogue, target: ModelKey): boolean {
  return (
    target.family === "image" &&
    catalogue.image.some(
      (row) => row.provider === target.provider && row.id === target.model && isVideoModel(row),
    )
  );
}

export function costOf(catalogue: Catalogue, target: ModelKey): CheckCost {
  if (target.provider === systemVoiceProvider) return { dollars: 0, planUsage: false };
  if (isLocalCliProvider(target.provider)) return { dollars: 0, planUsage: true };
  return { dollars: priced(catalogue, target, assumed), planUsage: false };
}

// What a finished check cost, from what it reported; the estimate when it reported nothing.
export function spentOn(catalogue: Catalogue, target: ModelKey, use: ProviderUse | null): number {
  if (isLocalCliProvider(target.provider) || target.provider === systemVoiceProvider) return 0;
  const reported =
    use === null
      ? null
      : priced(catalogue, target, {
          tokensIn: use.tokensIn ?? assumed.tokensIn,
          tokensOut: use.tokensOut ?? assumed.tokensOut,
          characters: use.characters ?? assumed.characters,
          images: use.images ?? assumed.images,
        });
  return reported ?? costOf(catalogue, target).dollars ?? 0;
}

function priced(
  catalogue: Catalogue,
  target: ModelKey,
  use: { tokensIn: number; tokensOut: number; characters: number; images: number },
): number | null {
  const call: ProviderUse = {
    kind: target.family,
    provider: target.provider,
    model: target.model,
    wallMs: 0,
    ...use,
  };
  const price = priceCall(call, catalogue);
  if (price.cost !== null) return price.cost;
  // A voice priced by the minute: two characters are well under a second.
  const perMinute =
    target.family === "tts"
      ? catalogue.tts.find((row) => row.provider === target.provider && row.id === target.model)
          ?.pricing.perMinute
      : undefined;
  return perMinute === undefined ? null : perMinute / 60;
}

// Automatic checks (a key or CLI added, the weekly look) run only what costs nothing, a CLI
// plan's allowance, or a text or voice call under the ceiling. Images and clips never.
export function automaticAllowed(catalogue: Catalogue, target: ModelKey, cost: CheckCost): boolean {
  if (target.family === "image" || isVideoTarget(catalogue, target)) return false;
  if (cost.planUsage) return true;
  return cost.dollars !== null && cost.dollars < automaticCeilingDollars;
}
