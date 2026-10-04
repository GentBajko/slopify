import { type ThinkingMode, thinkingModes } from "../kernel/ports/llm.js";
import type { ModelInfo, ModelPrice } from "../kernel/ports/model.js";
import type { CatalogueModel } from "./schema.js";

// What a picker shows for one catalogued model: its name, thinking modes, list price and
// context size, so the choice is made knowing what it costs and how much it reads at once.
export function catalogueModelInfo(model: CatalogueModel): ModelInfo {
  const price = priceOf(model.pricing);
  const llm = "llm" in model ? model.llm : undefined;
  return {
    id: model.id,
    name: model.name,
    ...(llm?.thinking ? { thinkingModes: Object.keys(llm.thinking).filter(isThinkingMode) } : {}),
    ...(price === undefined ? {} : { price }),
    ...(llm?.contextTokens === undefined ? {} : { contextTokens: llm.contextTokens }),
  };
}

function priceOf(pricing: CatalogueModel["pricing"]): ModelPrice | undefined {
  const price: ModelPrice = {
    ...(pricing.inputPerMillionTokens === undefined
      ? {}
      : { inputPerMillionTokens: pricing.inputPerMillionTokens }),
    ...(pricing.outputPerMillionTokens === undefined
      ? {}
      : { outputPerMillionTokens: pricing.outputPerMillionTokens }),
    ...(pricing.perMillionCharacters === undefined
      ? {}
      : { perMillionCharacters: pricing.perMillionCharacters }),
    ...(pricing.perImage === undefined ? {} : { perImage: pricing.perImage }),
    ...(pricing.perMinute === undefined ? {} : { perMinute: pricing.perMinute }),
  };
  return Object.keys(price).length === 0 ? undefined : price;
}

function isThinkingMode(key: string): key is ThinkingMode {
  return thinkingModes.some((mode) => mode === key);
}
