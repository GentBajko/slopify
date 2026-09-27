import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CatalogueStore } from "../../catalog/store.js";
import { type RunDraft, sourceOf, thumbnailCountOf } from "../admission/model.js";
import {
  imageSecondsProblem,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "../admission/rules.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { chunkNarration, defaultChunking } from "../narration/chunk.js";
import { normalizeNarrationText } from "../narration/plan.js";
import { preparationMessages } from "../narration/preparation.js";
import { isLocalCliProvider } from "../settings/model.js";
import {
  defaultShortsImagePrompt,
  defaultShortsPrompt,
  shortsImageUpperBound,
  shortsSettingsProblems,
} from "../shorts/model.js";
import {
  animatedClipSeconds,
  animatedImageIndexes,
  usesAnimation,
  videoEditProblems,
} from "../video/edit-settings.js";
import { defaultDescriptionPrompt } from "../youtube/model.js";

// ceiling: the most chapters "Chapter openers" is charged for before the article exists, the
// top of the 5-12 chapters the built-in YouTube description prompt asks for.
const chapterOpenersMax = 12;

import { estimateRequests, groupEstimateRows, type PricedRequest } from "./requests.js";

export { estimateRequests, type PricedRequest } from "./requests.js";

export interface CostRow {
  readonly stage: string;
  readonly low: number | null;
  readonly high: number | null;
  readonly detail: string;
  // A CLI charge: $0 on the user's plan, and what the same work would cost through the API
  // (null when the catalogue has no API price for it). Absent for keyed providers.
  readonly onPlan?: boolean | undefined;
  readonly apiLow?: number | null | undefined;
  readonly apiHigh?: number | null | undefined;
}
export interface CostEstimate {
  readonly currency: "USD";
  readonly rows: readonly CostRow[];
  readonly low: number;
  readonly high: number;
  readonly unknown: number;
  // The API-equivalent range of the rows on a plan, and how many of them have no API price.
  // Absent when no row runs on a plan.
  readonly apiLow?: number | undefined;
  readonly apiHigh?: number | undefined;
  readonly apiUnknown?: number | undefined;
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
  const textNote = isLocalCliProvider(llm.provider)
    ? "Runs on your CLI plan, so it adds no charge; the API figure is what the same tokens would cost through the API."
    : (data.llm.find(
        (model) =>
          model.provider === llm.provider &&
          model.id === llm.model &&
          model.enabled &&
          !model.deprecated,
      )?.pricing.note ??
      "CLI subscription or model pricing is unavailable; usage may be billed by your account.");
  const imageNote = isLocalCliProvider(image.provider)
    ? "Runs on your Codex plan, so it adds no charge; no API price is given for agent-drawn images."
    : (data.image.find(
        (model) =>
          model.provider === image.provider &&
          model.id === image.model &&
          model.enabled &&
          !model.deprecated,
      )?.pricing.note ?? "Model or account pricing is unknown.");
  const generatedArticle = draft.sources.article === "generate";
  const articleChars = generatedArticle ? expectedWords * 6 : (draft.provided.article?.length ?? 0);
  const promptChars = Object.entries(rendered).reduce(
    (sum, [key, value]) =>
      sum +
      (key === "narration" || key === "description" || key === "shorts" || key === "shortsImage"
        ? 0
        : value.length),
    0,
  );
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
    if (usesNarrationPreparation(draft)) {
      const known = generatedArticle
        ? []
        : [
            ...chunkNarration(
              normalizeNarrationText(plainText(splitEndMatter(draft.provided.article ?? "").body)),
              draft.chunking ?? defaultChunking,
            ),
          ];
      const unknown =
        generatedArticle || draft.intro?.mode === "llm" || draft.outro?.mode === "llm";
      for (const category of ["intro", "outro"] as const)
        if (draft[category]?.mode === "text" && rendered[category]?.trim())
          known.push(rendered[category] ?? "");
      if (unknown)
        requests.push({
          kind: "unknown",
          stage: "Narration Preparation",
          detail:
            "One LLM call per future logical narration chunk and enabled entry; generated source length is not yet known.",
        });
      else
        for (const source of known)
          text(
            "Narration Preparation",
            preparationMessages(rendered.narration ?? "", source).reduce(
              (n, message) => n + message.content.length,
              0,
            ),
            2400,
            `${known.length} LLM calls: one per logical narration chunk or entry.`,
          );
      requests.push({
        kind: "unknown",
        stage: "Delivery cue overhead",
        detail:
          "TTS character charges include delivery tags; their length is known after preparation.",
      });
    }
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
  // The establishing image is one more image when it is made from a prompt.
  if (usesReference(draft) && draft.reference?.source === "prompt")
    requests.push({
      kind: "image",
      stage: "Establishing image",
      provider: image.provider,
      model: image.model,
    });
  if (["from_prompt", "prompt_by_llm"].includes(draft.sources.thumbnail))
    for (let variant = 1; variant <= thumbnailCountOf(draft); variant++)
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
  // The timed transcript is the narration with a time before every passage of about 20 s,
  // plus the fixed rules of the answer.
  if (usesYoutubeDescription(draft))
    text(
      "YouTube description",
      (rendered.description?.trim()
        ? rendered.description.length
        : defaultDescriptionPrompt.length) +
        Math.round(articleChars * 1.05) +
        1500,
      2400,
      "One LLM call on the timed transcript.",
    );
  // Shorts: one call picks the clips from the numbered transcript, one per clip writes its
  // image prompts, and the images are charged at the most the step can ask for, every clip
  // at the longest length allowed.
  const shorts = draft.shorts;
  // Numbers the run would refuse are not priced: a typo of 3000 shorts would list them all.
  if (
    usesShorts(draft) &&
    shorts !== undefined &&
    shortsSettingsProblems(shorts).length === 0 &&
    imageSecondsProblem(draft.imageSeconds) === undefined
  ) {
    text(
      "Shorts",
      (rendered.shorts?.trim() ? rendered.shorts.length : defaultShortsPrompt.length) +
        Math.round(articleChars * 1.15) +
        1500,
      400 * shorts.count,
      "One LLM call on the numbered transcript picks the clips.",
    );
    const style = rendered.shortsImage?.trim()
      ? rendered.shortsImage.length
      : defaultShortsImagePrompt.length;
    for (let clip = 0; clip < shorts.count; clip++)
      text("Shorts", style + 3000, 2400, "One LLM call per short writes its image prompts.");
    const count = shortsImageUpperBound(shorts, draft.imageSeconds);
    for (let index = 0; index < count; index++)
      requests.push({
        kind: "image",
        stage: "Shorts",
        provider: image.provider,
        model: image.model,
        detail: `Up to ${String(count)} vertical images. ${imageNote}`,
      });
  }
  // Animated images: one clip from the image-to-video model per animated image, each priced
  // as the catalogue prices one clip. Only drawn images are animated; the chapter openers are
  // charged at the most there can be, one per image up to twelve chapters.
  const edit = draft.videoEdit;
  if (usesAnimation(draft) && edit !== undefined && videoEditProblems(draft).length === 0) {
    const clips =
      edit.animate === "every"
        ? animatedImageIndexes(edit, images).length
        : Math.min(images, chapterOpenersMax);
    const note =
      data.image.find(
        (model) => model.provider === image.provider && model.id === edit.animateModel,
      )?.pricing.note ?? "Model or account pricing is unknown.";
    for (let index = 0; index < clips; index++)
      requests.push({
        kind: "image",
        stage: "Animated images",
        provider: image.provider,
        model: edit.animateModel,
        detail:
          edit.animate === "every"
            ? `${String(clips)} clips of ${String(animatedClipSeconds)} seconds. ${note}`
            : `Up to ${String(clips)} clips of ${String(animatedClipSeconds)} seconds, one per chapter opening. ${note}`,
      });
  }
  if (sourceOf(draft.sources, "document") === "generate")
    local("Document", "Laid out locally from the article; no API fee.");
  return {
    ...groupEstimateRows(estimateRequests(requests, data)),
    expectedWords,
    catalogueDate: catalogue === undefined ? null : data.updatedAt,
  };
}
