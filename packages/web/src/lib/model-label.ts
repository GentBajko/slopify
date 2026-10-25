import type { ModelInfo, ModelPrice } from "@app/kernel/ports/model.js";

const dollars = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

// A model's list price as one short phrase, or undefined when models.yaml names none (unknown,
// never free).
export function modelPriceLabel(price: ModelPrice | undefined): string | undefined {
  if (price === undefined) return undefined;
  const { inputPerMillionTokens: input, outputPerMillionTokens: output } = price;
  if (input !== undefined && output !== undefined)
    return `${dollars.format(input)} in / ${dollars.format(output)} out per 1M tokens`;
  if (input !== undefined) return `${dollars.format(input)} per 1M input tokens`;
  if (price.perMillionCharacters !== undefined)
    return `${dollars.format(price.perMillionCharacters)} per 1M characters`;
  if (price.perImage !== undefined) return `${dollars.format(price.perImage)} per image`;
  if (price.perMinute !== undefined) return `${dollars.format(price.perMinute)} per minute`;
  return undefined;
}

// What a model's dropdown entry says: its name, then its price and context size when known.
export function modelOptionLabel(model: ModelInfo): string {
  const price = modelPriceLabel(model.price);
  const context =
    model.contextTokens === undefined
      ? undefined
      : `${compact.format(model.contextTokens)} context`;
  return [model.name, price, context].filter((part) => part !== undefined).join(" · ");
}

// Create's entry for a model: its name, and its price only where a person reads it as a price
// (per image, per minute). Token prices and context sizes are jargon there and cut the closed
// select short; the run's estimate beside the Make button says what the choice costs.
export function modelChoiceLabel(model: ModelInfo): string {
  const price = model.price;
  const plain =
    price?.perImage !== undefined || price?.perMinute !== undefined
      ? modelPriceLabel({
          ...(price.perImage === undefined ? {} : { perImage: price.perImage }),
          ...(price.perMinute === undefined ? {} : { perMinute: price.perMinute }),
        })
      : undefined;
  return plain === undefined ? model.name : `${model.name} · ${plain}`;
}
