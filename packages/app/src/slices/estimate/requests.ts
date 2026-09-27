import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import { apiEquivalentOf, tokenCost } from "../run-cost/pricing.js";
import { isLocalCliProvider } from "../settings/model.js";
import type { CostEstimate, CostRow } from "./index.js";

const quantity = z.number().finite().nonnegative();
const common = z.object({
  stage: z.string(),
  detail: z.string().optional(),
  variable: z.boolean().optional(),
  expectedWords: quantity.optional(),
});
const provider = common.extend({
  provider: z.string(),
  model: z.string(),
  // A CLI request whose API figure cannot be told in advance.
  apiUnknown: z.literal(true).optional(),
});
const requestSchema = z.discriminatedUnion("kind", [
  provider
    .extend({ kind: z.literal("llm"), inputCharacters: quantity, outputCharacters: quantity })
    .strict(),
  provider.extend({ kind: z.literal("tts"), text: z.string() }).strict(),
  provider.extend({ kind: z.literal("tts-estimate"), characters: quantity }).strict(),
  provider.extend({ kind: z.literal("image") }).strict(),
  common.extend({ kind: z.literal("local") }).strict(),
  common.extend({ kind: z.literal("unknown") }).strict(),
]);
export type PricedRequest = Readonly<z.infer<typeof requestSchema>>;

export function estimateRequests(
  requests: readonly PricedRequest[],
  catalogue: Catalogue,
): CostEstimate {
  const parsed = z.array(requestSchema).parse(requests);
  const rows = parsed.map((request) => price(request, catalogue));
  return {
    currency: "USD",
    rows,
    low: rows.reduce((total, row) => total + (row.low ?? 0), 0),
    high: rows.reduce((total, row) => total + (row.high ?? 0), 0),
    unknown: rows.filter((row) => row.low === null).length,
    ...apiTotals(rows),
    expectedWords: parsed.reduce((total, request) => total + (request.expectedWords ?? 0), 0),
    catalogueDate: catalogue.updatedAt,
    assumptions: [
      "Planning estimate, not a spending limit. Generated lengths use a ±50% range; actual output can exceed it.",
      "Assumes roughly 6 characters per word, 4 characters per token, and 150 spoken words per minute.",
      "Retries, extra reasoning tokens, web tools, taxes, discounts and included credits are excluded. Unknown charges are not counted as zero.",
    ],
  };
}

export function groupEstimateRows(estimate: CostEstimate): CostEstimate {
  const grouped = new Map<string, CostRow>();
  for (const row of estimate.rows) {
    const previous = grouped.get(row.stage);
    const plan = previous?.onPlan === true || row.onPlan === true;
    const sum = (
      left: number | null | undefined,
      right: number | null | undefined,
    ): number | null => (left === null || right === null ? null : (left ?? 0) + (right ?? 0));
    grouped.set(
      row.stage,
      previous === undefined
        ? row
        : {
            ...previous,
            low: previous.low === null || row.low === null ? null : previous.low + row.low,
            high: previous.high === null || row.high === null ? null : previous.high + row.high,
            ...(plan
              ? {
                  onPlan: true,
                  apiLow: sum(previous.apiLow, row.apiLow),
                  apiHigh: sum(previous.apiHigh, row.apiHigh),
                }
              : {}),
          },
    );
  }
  const rows = [...grouped.values()];
  return {
    ...estimate,
    rows,
    unknown: rows.filter((row) => row.low === null).length,
    ...apiTotals(rows),
  };
}

function apiTotals(
  rows: readonly CostRow[],
): Pick<CostEstimate, "apiLow" | "apiHigh" | "apiUnknown"> {
  const plan = rows.filter((row) => row.onPlan === true);
  if (plan.length === 0) return {};
  return {
    apiLow: plan.reduce((total, row) => total + (row.apiLow ?? 0), 0),
    apiHigh: plan.reduce((total, row) => total + (row.apiHigh ?? 0), 0),
    apiUnknown: plan.filter((row) => row.apiLow === null || row.apiLow === undefined).length,
  };
}

// A CLI call adds nothing to the bill - it runs on the user's plan - so it is known at $0,
// with what the same tokens would cost through the API beside it, priced by the same
// catalogue and the same token assumptions as a keyed model. A Codex image has no API
// figure: how many drafts the agent draws is not known in advance.
function onPlan(
  request: Extract<PricedRequest, { kind: "llm" | "image" }>,
  catalogue: Catalogue,
): CostRow {
  const api =
    request.kind === "llm"
      ? apiEquivalentOf(request.provider, request.model, catalogue)
      : undefined;
  const amount =
    api === undefined || request.kind !== "llm" || request.apiUnknown === true
      ? null
      : tokenCost(api.pricing, request.inputCharacters / 4, request.outputCharacters / 4);
  return {
    stage: request.stage,
    low: 0,
    high: 0,
    detail:
      request.detail ??
      (amount === null
        ? "Runs on your CLI plan, so it adds no charge; no API price is listed for this model."
        : `Runs on your CLI plan, so it adds no charge; priced as ${api?.name ?? "the API model"} through the API.`),
    onPlan: true,
    apiLow: amount === null ? null : amount * 0.5,
    apiHigh: amount === null ? null : amount * 1.5,
  };
}

function price(request: PricedRequest, catalogue: Catalogue): CostRow {
  if (request.kind === "unknown")
    return {
      stage: request.stage,
      low: null,
      high: null,
      detail: request.detail ?? "Request size is not available yet.",
    };
  if (request.kind === "local")
    return {
      stage: request.stage,
      low: 0,
      high: 0,
      detail: request.detail ?? "Local processing or retained output; no API fee.",
    };
  if ((request.kind === "llm" || request.kind === "image") && isLocalCliProvider(request.provider))
    return onPlan(request, catalogue);
  const family = request.kind === "tts-estimate" ? "tts" : request.kind;
  const model = catalogue[family].find(
    (entry) =>
      entry.provider === request.provider &&
      entry.id === request.model &&
      entry.enabled &&
      !entry.deprecated,
  );
  const rates = model?.pricing;
  let amount: number | undefined;
  let variable = request.variable === true;
  let detail = rates?.note ?? "Model or account pricing is unknown.";
  switch (request.kind) {
    case "llm":
      if (rates?.inputPerMillionTokens !== undefined && rates.outputPerMillionTokens !== undefined)
        amount =
          ((request.inputCharacters / 4) * rates.inputPerMillionTokens +
            (request.outputCharacters / 4) * rates.outputPerMillionTokens) /
          1000000;
      variable = true;
      break;
    case "tts":
    case "tts-estimate": {
      const characters = request.kind === "tts" ? request.text.length : request.characters;
      const perMinute = rates?.perMillionCharacters === undefined && rates?.perMinute !== undefined;
      if (rates?.perMillionCharacters !== undefined)
        amount = (characters / 1000000) * rates.perMillionCharacters;
      else if (rates?.perMinute !== undefined) amount = (characters / 6 / 150) * rates.perMinute;
      variable ||= request.kind === "tts-estimate" || perMinute;
      detail = `About ${characters.toLocaleString()} characters. ${detail}`;
      break;
    }
    case "image":
      amount = rates?.perImage;
      break;
  }
  if (amount !== undefined) quantity.parse(amount);
  return {
    stage: request.stage,
    low: amount === undefined ? null : amount * (variable ? 0.5 : 1),
    high: amount === undefined ? null : amount * (variable ? 1.5 : 1),
    detail: request.detail ?? detail,
  };
}
