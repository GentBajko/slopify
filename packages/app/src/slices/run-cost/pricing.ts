import type { Catalogue } from "../../catalog/schema.js";
import type { ProviderUse } from "../../kernel/runner/meter.js";
import { isLocalCliProvider } from "../settings/model.js";

// One price source for the estimate before Start and the cost after: the model catalogue
// (assets/models.yaml, or the refreshed copy in the data folder). A model it does not price
// is unknown, never free.

type LlmModel = Catalogue["llm"][number];
type Rates = LlmModel["pricing"];

export interface CallPrice {
  // A CLI call is billed to the user's plan, so it costs nothing here.
  readonly onPlan: boolean;
  // USD, null when the catalogue has no price for it (or the provider reported no usage).
  readonly cost: number | null;
  // For a CLI call: the API model the same tokens were priced at, and what they would cost.
  readonly apiModel: string | null;
  readonly apiCost: number | null;
  // The rates the cost was worked out from, stored with the call.
  readonly price: Readonly<Record<string, unknown>> | null;
}

// Per million tokens; cached input at its own rate when the catalogue gives one.
export function tokenCost(
  rates: Rates,
  tokensIn: number,
  tokensOut: number,
  cachedTokens = 0,
): number | null {
  if (rates.inputPerMillionTokens === undefined || rates.outputPerMillionTokens === undefined)
    return null;
  const cached = Math.min(Math.max(0, cachedTokens), tokensIn);
  return (
    ((tokensIn - cached) * rates.inputPerMillionTokens +
      cached * (rates.cachedInputPerMillionTokens ?? rates.inputPerMillionTokens) +
      tokensOut * rates.outputPerMillionTokens) /
    1_000_000
  );
}

// The API model a CLI's model is billed as when it is called through a key: Claude Code's
// models are Anthropic's, Codex's are OpenAI's and Gemini's are Google's, all listed in the
// catalogue under OpenRouter. A version the catalogue does not list has no API price.
export function apiEquivalentOf(
  provider: string,
  model: string,
  catalogue: Catalogue,
): LlmModel | undefined {
  const listed = (id: string): LlmModel | undefined =>
    catalogue.llm.find((entry) => entry.provider === "openrouter" && entry.id === id);
  // Context sizes ("[1m]") and dated snapshots ("-20251001") price as the model itself.
  const bare = model
    .replace(/\[[^\]]*\]/g, "")
    .replace(/-\d{8}$/, "")
    .trim();
  if (provider === "claude-code") {
    const family = /^(?:claude-)?(opus|sonnet|haiku|fable)(?:-(\d+)(?:-(\d{1,2}))?)?$/i.exec(bare);
    if (family === null) return undefined;
    const name = (family[1] ?? "").toLowerCase();
    if (family[2] !== undefined)
      return listed(`anthropic/claude-${name}-${family[2]}${family[3] ? `.${family[3]}` : ""}`);
    // An alias ("sonnet") is the newest of that family the catalogue lists.
    return catalogue.llm
      .filter(
        (entry) =>
          entry.provider === "openrouter" && entry.id.startsWith(`anthropic/claude-${name}-`),
      )
      .toSorted((left, right) => right.id.localeCompare(left.id, "en", { numeric: true }))[0];
  }
  if (bare === "" || bare === "codex-imagegen") return undefined;
  if (provider === "codex" || provider === "codex-image") return listed(`openai/${bare}`);
  if (provider === "gemini") return listed(`google/${bare}`);
  return undefined;
}

export function priceCall(call: ProviderUse, catalogue: Catalogue): CallPrice {
  const date = catalogue.updatedAt;
  if (isLocalCliProvider(call.provider)) {
    // Only text is priced through the API: what a Codex image would cost there depends on
    // how many drafts the agent drew, which the CLI does not say.
    const api =
      call.kind === "llm" ? apiEquivalentOf(call.provider, call.model, catalogue) : undefined;
    const apiCost =
      api === undefined || call.tokensIn === undefined || call.tokensOut === undefined
        ? null
        : tokenCost(api.pricing, call.tokensIn, call.tokensOut, call.cachedTokens);
    return {
      onPlan: true,
      cost: 0,
      apiModel: api?.id ?? null,
      apiCost,
      price: api === undefined ? null : { catalogue: date, model: api.id, ...api.pricing },
    };
  }
  const family = call.kind === "video" ? "image" : call.kind;
  const entry = catalogue[family].find(
    (model) => model.provider === call.provider && model.id === call.model,
  );
  const rates = entry?.pricing;
  let cost: number | null = null;
  if (rates !== undefined)
    switch (call.kind) {
      case "llm":
        cost =
          call.tokensIn === undefined || call.tokensOut === undefined
            ? null
            : tokenCost(rates, call.tokensIn, call.tokensOut, call.cachedTokens);
        break;
      case "tts":
        // ceiling: a per-minute voice is left unpriced rather than guessed from characters;
        // the narration's measured length is known only after the stage writes the file.
        cost =
          rates.perMillionCharacters === undefined || call.characters === undefined
            ? null
            : (call.characters / 1_000_000) * rates.perMillionCharacters;
        break;
      case "image":
      case "video":
        // An image-to-video model's perImage is the price of one clip.
        cost = rates.perImage === undefined ? null : rates.perImage * (call.images ?? 1);
        break;
    }
  return {
    onPlan: false,
    cost,
    apiModel: null,
    apiCost: null,
    price: rates === undefined ? null : { catalogue: date, model: call.model, ...rates },
  };
}
