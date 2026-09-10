import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CatalogueStore } from "../../catalog/store.js";
import type { RunDraft } from "../admission/model.js";
import { estimateRequests, groupEstimateRows, type PricedRequest } from "./requests.js";

export { estimateRequests, type PricedRequest } from "./requests.js";

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
  z.number().finite().nonnegative().parse(expectedWords);
  const data: Catalogue = catalogue?.read() ?? {
    schemaVersion: 1,
    updatedAt: "",
    providers: {},
    llm: [],
    tts: [],
    image: [],
  };
  const requests: PricedRequest[] = [];
  const llm = draft.llm ?? { provider: "", model: "" };
  const tts = draft.audio ?? { provider: "", model: "" };
  const image = draft.images ?? { provider: "", model: "" };
  const textNote =
    data.llm.find(
      (model) =>
        model.provider === llm.provider &&
        model.id === llm.model &&
        model.enabled &&
        !model.deprecated,
    )?.pricing.note ??
    "CLI subscription or model pricing is unavailable; usage may be billed by your account.";
  const imageNote =
    data.image.find(
      (model) =>
        model.provider === image.provider &&
        model.id === image.model &&
        model.enabled &&
        !model.deprecated,
    )?.pricing.note ?? "Model or account pricing is unknown.";
  const generatedArticle = draft.sources.article === "generate";
  const articleChars = generatedArticle ? expectedWords * 6 : (draft.provided.article?.length ?? 0);
  const promptChars = Object.values(rendered).reduce((sum, value) => sum + value.length, 0);
  const local = (stage: string, detail: string): void => {
    requests.push({ kind: "local", stage, detail });
  };
  const text = (
    stage: string,
    inputCharacters: number,
    outputCharacters: number,
    detail?: string,
  ): void => {
    requests.push({
      kind: "llm",
      stage,
      provider: llm.provider,
      model: llm.model,
      inputCharacters,
      outputCharacters,
      detail: detail === undefined ? textNote : `${detail} ${textNote}`,
    });
  };
  if (draft.sources.research === "generate")
    text(
      "Research",
      promptChars + 6000,
      12000,
      "Assumes about 2,000 words of notes; web search fees are excluded.",
    );
  else local("Research", "Provided or off; no generation charge.");
  if (generatedArticle)
    text(
      "Article",
      promptChars + (draft.sources.research === "generate" ? 12000 : 0),
      articleChars,
      `${expectedWords.toLocaleString()} expected words.`,
    );
  else local("Article", "Provided article; no generation charge.");
  if (draft.intro?.mode === "llm" || draft.outro?.mode === "llm")
    text("Intro / outro text", promptChars + articleChars, 2400);
  if (draft.sources.audio === "generate") {
    const extras = ["intro", "outro"].reduce((n, key) => n + (rendered[key]?.length ?? 0), 0);
    const llmExtras =
      (draft.intro?.mode === "llm" ? 1200 : 0) + (draft.outro?.mode === "llm" ? 1200 : 0);
    const choice = { stage: "Narration", provider: tts.provider, model: tts.model };
    requests.push(
      generatedArticle || llmExtras > 0
        ? { ...choice, kind: "tts-estimate", characters: articleChars + extras + llmExtras }
        : {
            ...choice,
            kind: "tts",
            text: (draft.provided.article ?? "") + (rendered.intro ?? "") + (rendered.outro ?? ""),
          },
    );
  } else local("Narration", "Provided or off; no generation charge.");
  const images =
    draft.sources.images === "generate"
      ? draft.imagePrompts.reduce((n, prompt) => n + prompt.number, 0)
      : 0;
  z.number().int().nonnegative().parse(images);
  for (let index = 0; index < images; index++)
    requests.push({
      kind: "image",
      stage: "Images",
      provider: image.provider,
      model: image.model,
      detail: `${images} images. ${imageNote}`,
    });
  if (images === 0) local("Images", "Provided or off.");
  if (["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail))
    requests.push({
      kind: "image",
      stage: "Thumbnail",
      provider: image.provider,
      model: image.model,
    });
  else local("Thumbnail", "Provided or off.");
  if (draft.sources.thumbnail === "prompt_by_llm")
    text("Thumbnail prompt", promptChars + articleChars, 1200);
  local("Export / subtitles", "Local processing; no API fee.");
  return {
    ...groupEstimateRows(estimateRequests(requests, data)),
    expectedWords,
    catalogueDate: catalogue === undefined ? null : data.updatedAt,
  };
}
