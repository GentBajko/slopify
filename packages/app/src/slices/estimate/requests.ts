import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CostEstimate, CostRow } from "./index.js";

const quantity = z.number().finite().nonnegative();
const common = z.object({
  stage: z.string(),
  detail: z.string().optional(),
  variable: z.boolean().optional(),
  expectedWords: quantity.optional(),
});
const provider = common.extend({ provider: z.string(), model: z.string() });
const requestSchema = z.discriminatedUnion("kind", [
  provider
    .extend({ kind: z.literal("llm"), inputCharacters: quantity, outputCharacters: quantity })
    .strict(),
  provider.extend({ kind: z.literal("tts"), text: z.string() }).strict(),
  provider.extend({ kind: z.literal("tts-estimate"), characters: quantity }).strict(),
  provider.extend({ kind: z.literal("image") }).strict(),
  common.extend({ kind: z.literal("local") }).strict(),
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
    grouped.set(
      row.stage,
      previous === undefined
        ? row
        : {
            ...previous,
            low: previous.low === null || row.low === null ? null : previous.low + row.low,
            high: previous.high === null || row.high === null ? null : previous.high + row.high,
          },
    );
  }
  const rows = [...grouped.values()];
  return { ...estimate, rows, unknown: rows.filter((row) => row.low === null).length };
}

function price(request: PricedRequest, catalogue: Catalogue): CostRow {
  if (request.kind === "local")
    return {
      stage: request.stage,
      low: 0,
      high: 0,
      detail: request.detail ?? "Local processing or retained output; no API fee.",
    };
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
