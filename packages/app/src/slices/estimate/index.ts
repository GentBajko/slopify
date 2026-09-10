import type { CatalogueModel } from "../../catalog/schema.js";
import type { CatalogueStore } from "../../catalog/store.js";
import type { RunDraft } from "../admission/model.js";

export interface CostRow {
  readonly stage: string;
  readonly low: number | null;
  readonly high: number | null;
  readonly detail: string;
}
export interface CostEstimate {
  readonly currency: "USD";
  readonly rows: readonly CostRow[];
  readonly low: number;
  readonly high: number;
  readonly unknown: number;
  readonly expectedWords: number;
  readonly catalogueDate: string | null;
  readonly assumptions: readonly string[];
}
export function estimateRun(
  draft: RunDraft,
  rendered: Readonly<Record<string, string>>,
  expectedWords: number,
  catalogue?: CatalogueStore,
): CostEstimate {
  const rows: CostRow[] = [];
  const model = (
    family: "llm" | "tts" | "image",
    choice: { provider: string; model: string } | undefined,
  ): CatalogueModel | undefined =>
    choice
      ? catalogue?.models(choice.provider, family).find((m) => m.id === choice.model)
      : undefined;
  const llm = model("llm", draft.llm);
  const tts = model("tts", draft.audio);
  const image = model("image", draft.images);
  const generatedArticle = draft.sources.article === "generate";
  const articleChars = generatedArticle ? expectedWords * 6 : (draft.provided.article?.length ?? 0);
  const promptChars = Object.values(rendered).reduce((sum, value) => sum + value.length, 0);
  const row = (
    stage: string,
    amount: number | undefined,
    detail: string,
    variable = false,
  ): void => {
    rows.push({
      stage,
      low: amount === undefined ? null : amount * (variable ? 0.5 : 1),
      high: amount === undefined ? null : amount * (variable ? 1.5 : 1),
      detail,
    });
  };
  const textCost = (input: number, output: number): number | undefined => {
    const p = llm?.pricing;
    return p?.inputPerMillionTokens === undefined || p.outputPerMillionTokens === undefined
      ? undefined
      : ((input / 4) * p.inputPerMillionTokens + (output / 4) * p.outputPerMillionTokens) / 1000000;
  };
  const textNote =
    llm?.pricing.note ??
    "CLI subscription or model pricing is unavailable; usage may be billed by your account.";
  if (draft.sources.research === "generate")
    row(
      "Research",
      textCost(promptChars + 6000, 12000),
      `Assumes about 2,000 words of notes; web search fees are excluded. ${textNote}`,
      true,
    );
  else row("Research", 0, "Provided or off; no generation charge.");
  if (generatedArticle)
    row(
      "Article",
      textCost(promptChars + (draft.sources.research === "generate" ? 12000 : 0), articleChars),
      `${expectedWords.toLocaleString()} expected words. ${textNote}`,
      true,
    );
  else row("Article", 0, "Provided article; no generation charge.");
  if (draft.intro?.mode === "llm" || draft.outro?.mode === "llm")
    row("Intro / outro text", textCost(promptChars + articleChars, 2400), textNote, true);
  if (draft.sources.audio === "generate") {
    const extras = ["intro", "outro"].reduce((n, key) => n + (rendered[key]?.length ?? 0), 0);
    const llmExtras =
      (draft.intro?.mode === "llm" ? 1200 : 0) + (draft.outro?.mode === "llm" ? 1200 : 0);
    const chars = articleChars + extras + llmExtras;
    const p = tts?.pricing;
    const amount =
      p?.perMillionCharacters === undefined
        ? p?.perMinute === undefined
          ? undefined
          : (chars / 6 / 150) * p.perMinute
        : (chars / 1000000) * p.perMillionCharacters;
    row(
      "Narration",
      amount,
      `About ${chars.toLocaleString()} characters. ${p?.note ?? "Account pricing is unknown."}`,
      generatedArticle || llmExtras > 0 || p?.perMinute !== undefined,
    );
  } else row("Narration", 0, "Provided or off; no generation charge.");
  const images =
    draft.sources.images === "generate" ? draft.imagePrompts.reduce((n, p) => n + p.number, 0) : 0;
  row(
    "Images",
    images === 0
      ? 0
      : image?.pricing.perImage === undefined
        ? undefined
        : images * image.pricing.perImage,
    images === 0
      ? "Provided or off."
      : `${images} images. ${image?.pricing.note ?? "Model or account pricing is unknown."}`,
  );
  const thumbnail = ["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail);
  row(
    "Thumbnail",
    thumbnail ? image?.pricing.perImage : 0,
    thumbnail
      ? (image?.pricing.note ?? "Model or account pricing is unknown.")
      : "Provided or off.",
  );
  if (draft.sources.thumbnail === "prompt_by_llm")
    row("Thumbnail prompt", textCost(promptChars + articleChars, 1200), textNote, true);
  row("Export / subtitles", 0, "Local processing; no API fee.");
  return {
    currency: "USD",
    rows,
    expectedWords,
    catalogueDate: catalogue?.status().updatedAt ?? null,
    low: rows.reduce((n, r) => n + (r.low ?? 0), 0),
    high: rows.reduce((n, r) => n + (r.high ?? 0), 0),
    unknown: rows.filter((r) => r.low === null).length,
    assumptions: [
      "Planning estimate, not a spending limit. Generated lengths use a ±50% range; actual output can exceed it.",
      "Assumes roughly 6 characters per word, 4 characters per token, and 150 spoken words per minute.",
      "Retries, extra reasoning tokens, web tools, taxes, discounts and included credits are excluded. Unknown charges are not counted as zero.",
    ],
  };
}
