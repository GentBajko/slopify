import { z } from "zod";
import type { Catalogue } from "../../catalog/schema.js";
import type { CatalogueStore } from "../../catalog/store.js";
import { type RunDraft, sourceOf, thumbnailCountOf } from "../admission/model.js";
import {
  imageSecondsProblem,
  usesDescribedNarration,
  usesNarrationPreparation,
  usesReference,
  usesShorts,
  usesYoutubeDescription,
} from "../admission/rules.js";
import { plainText } from "../article/plain.js";
import { splitEndMatter } from "../article/split.js";
import { narrationMinutes, plannedImageCount, scalesImages } from "../images/scale.js";
import { describedBlocks, narrationBlocks } from "../narration/blocks.js";
import { chunkNarration, defaultChunking } from "../narration/chunk.js";
import { describeMessages } from "../narration/describe.js";
import { normalizeNarrationText } from "../narration/plan.js";
import { preparationMessages } from "../narration/preparation.js";
import { defaultReviewPrompts, reviewPromptKey, reviewRetriesOf } from "../reviews/model.js";
import { activeReviewStages } from "../reviews/rules.js";
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
import { usesVoices } from "../voices/model.js";
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
      (key === "narration" ||
      key === "description" ||
      key === "shorts" ||
      key === "shortsImage" ||
      key.startsWith("review.")
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
  if (usesDescribedNarration(draft)) {
    // One call per table, figure, equation or code block: counted in a provided article,
    // unknown until a generated one is written.
    const blocks = generatedArticle
      ? undefined
      : describedBlocks(
          narrationBlocks(splitEndMatter(draft.provided.article ?? "").body, {
            code: draft.audio?.skipCode === true ? "skip" : "describe",
            language: draft.language,
          }),
        );
    if (blocks === undefined)
      requests.push({
        kind: "unknown",
        stage: "Narration descriptions",
        detail:
          "One LLM call per table, figure, equation or code block in the article; how many is known once the article is written.",
      });
    else
      for (const block of blocks)
        text(
          "Narration descriptions",
          describeMessages(block, rendered.narration ?? "", draft.language).reduce(
            (n, message) => n + message.content.length,
            0,
          ),
          600,
          `${String(blocks.length)} LLM ${blocks.length === 1 ? "call" : "calls"}: one per table, figure, equation or code block.`,
        );
  }
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
            preparationMessages(rendered.narration ?? "", source, [], draft.language).reduce(
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
    const speakers = usesVoices(draft) ? (draft.voices?.speakers ?? []) : [];
    if (speakers.length > 0) {
      // Each speaker's voice is priced on an equal share of the script; the intro and outro
      // keep the narration voice.
      for (const speaker of speakers)
        requests.push({
          kind: "tts-estimate",
          stage: "Narration",
          provider: speaker.voice.provider,
          model: speaker.voice.model,
          characters: Math.round(articleChars / speakers.length),
          detail: `${speaker.name.trim() || "A speaker"}: assumes every speaker says about the same.`,
        });
      if (extras + llmExtras > 0)
        requests.push({ ...choice, kind: "tts-estimate", characters: extras + llmExtras });
      if (draft.voices?.source === "attribute")
        text(
          "Speaker split",
          articleChars + 1500,
          Math.round(articleChars * 1.1),
          "One LLM call hands the text's passages to the speakers.",
        );
      if (draft.voices?.source === "adapt")
        text(
          "Conversation script",
          articleChars + 1500,
          Math.round(articleChars * 1.2),
          "One LLM call rewrites the text as a conversation between the speakers; the article stays as written.",
        );
    } else
      requests.push(
        generatedArticle || llmExtras > 0
          ? { ...choice, kind: "tts-estimate", characters: articleChars + extras + llmExtras }
          : {
              ...choice,
              kind: "tts",
              text:
                (draft.provided.article ?? "") + (rendered.intro ?? "") + (rendered.outro ?? ""),
            },
      );
  } else local("Narration", "Provided or off; no generation charge.");
  const images =
    draft.sources.images === "generate"
      ? // Each prompt's Number, or more for a long video (`images/scale.ts`).
        plannedImageCount(draft)
      : 0;
  z.number().int().nonnegative().parse(images);
  for (let index = 0; index < images; index++)
    requests.push({
      kind: "image",
      stage: "Images",
      provider: image.provider,
      model: image.model,
      detail: scalesImages(draft)
        ? `${images} images for about ${String(Math.round(narrationMinutes(draft.imageScale.words)))} minutes of narration (${draft.imageScale.words.toLocaleString()} words). ${imageNote}`
        : `${images} images. ${imageNote}`,
    });
  if (images === 0) local("Images", "Provided or off.");
  // Scenes from the article: one call reads the article and writes every image's scene.
  if (images > 0 && draft.imageScenes === true)
    text("Image scenes", articleChars + 1500, 120 * images);
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
  // Automatic reviews: one call per reviewed item, on the reviewer's model. A failed item
  // made again is reviewed again, at most the retries allowed, which is not priced here.
  const reviews = draft.reviews;
  if (reviews !== undefined)
    for (const stage of activeReviewStages(draft)) {
      const picked = rendered[reviewPromptKey(stage)]?.trim() ?? "";
      const prompt = picked === "" ? defaultReviewPrompts[stage].length : picked.length;
      const items =
        stage === "images" ? images : stage === "shorts" ? (draft.shorts?.count ?? 0) : 1;
      const material =
        stage === "article"
          ? articleChars + promptChars
          : stage === "narration"
            ? Math.round(articleChars * 2.1)
            : 1500;
      for (let index = 0; index < items; index++)
        requests.push({
          kind: "llm",
          stage: "Reviews",
          provider: reviews.provider,
          model: reviews.model,
          inputCharacters: prompt + material + 800,
          outputCharacters: 400,
          detail: `One review per item. A failed item made again is reviewed again, up to ${String(reviewRetriesOf(reviews))} times; those remakes are not in this estimate. ${textNote}`,
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
