import { z } from "zod";
import { usesShorts } from "../admission/rules.js";
import { defaultShortsImagePrompt, shortImageCount } from "../shorts/model.js";
import { type ShortPick, shortPickSchema } from "../shorts/pick.js";
import { imagePromptMessages } from "../shorts/prompts.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";
import { llmInput, renderedPrompt } from "./recipe-text.js";

// The Shorts step unfolds as its answers land, the way research's chapters unfold from the
// plan. `shorts:pick` reads the word timing, so it waits for `subtitles:timing` and runs
// beside the render; until its saved answer matches, one deferred `shorts:future` stands in
// for everything after it (and carries the images' cost). Each picked clip then gets
// `shorts:N:prompts`, one LLM call writing its image prompts; once those match, its
// `shorts:N:image:M` images and its `shorts:N:render`. Every key after the pick carries the
// pick's regeneration token, so "Make the shorts again" redoes the whole chain.
export const shortsPickKey = "shorts:pick";
export const shortsFutureKey = "shorts:future";

export function shortsRecipes(
  context: RecipeContext,
  exports: readonly ResolvedWorkRecipe[],
): readonly ResolvedWorkRecipe[] {
  const { config } = context;
  const shorts = config.shorts;
  const timing = exports.find((value) => value.key === "subtitles:timing");
  if (!usesShorts(config) || shorts === undefined || timing === undefined) return [];
  const pick = recipe(
    context,
    shortsPickKey,
    "video",
    {
      kind: "local",
      version: 1,
      operation: "shorts-pick-v1",
      values: [
        resourceIdentity(context, timing),
        config.llm?.provider ?? "",
        config.llm?.model ?? "",
        config.llm?.thinking ?? null,
        // Blank means the built-in prompt; the step fills it in, so a new built-in wording
        // ships as a new operation version rather than a silent change here.
        shorts.prompt?.trim() ? renderedPrompt(context, "shorts") : "",
        shorts.count,
        shorts.minSeconds,
        shorts.maxSeconds,
        config.title,
      ],
    },
    [timing.key],
    // A paid LLM call: readiness, the charge warning and the estimate treat it like one.
    { kind: "provider" },
  );
  const picks = savedPicks(context, pick);
  const images = config.images ?? { provider: "", model: "" };
  const style = shorts.imagePrompt?.trim()
    ? renderedPrompt(context, "shortsImage")
    : defaultShortsImagePrompt;
  if (picks === undefined)
    return [
      pick,
      recipe(
        context,
        shortsFutureKey,
        "video",
        {
          kind: "deferred",
          version: 1,
          operation: "shorts",
          template: [
            pick.fingerprint,
            style,
            images.provider,
            images.model,
            config.imageSeconds,
            shorts.count,
            shorts.maxSeconds,
            config.llm?.provider ?? "",
            config.llm?.model ?? "",
          ],
        },
        [pick.key],
        { tokenKey: shortsPickKey },
      ),
    ];
  const recipes: ResolvedWorkRecipe[] = [pick];
  for (const clip of picks) {
    const prefix = `shorts:${String(clip.number)}`;
    const count = shortImageCount(clip.end - clip.start, config.imageSeconds);
    const prompts = recipe(
      context,
      `${prefix}:prompts`,
      "video",
      llmInput(
        context,
        imagePromptMessages({
          style,
          videoTitle: config.title,
          shortTitle: clip.title,
          text: clip.text,
          count,
          imageSeconds: config.imageSeconds,
        }),
      ),
      [pick.key],
      { tokenKey: shortsPickKey },
    );
    recipes.push(prompts);
    const written = savedPrompts(context, prompts);
    if (written === undefined || written.length !== count) continue;
    const stills = written.map((prompt, index) =>
      recipe(
        context,
        `${prefix}:image:${String(index + 1)}`,
        "video",
        {
          kind: "image",
          version: 1,
          provider: images.provider,
          model: images.model,
          prompt,
          aspect: "9:16",
        },
        [prompts.key],
        { tokenKey: shortsPickKey },
      ),
    );
    recipes.push(...stills);
    recipes.push(
      recipe(
        context,
        `${prefix}:render`,
        "video",
        {
          kind: "local",
          version: 1,
          operation: "short-render-v1",
          values: [
            resourceIdentity(context, timing),
            clip.number,
            clip.start,
            clip.end,
            stills.map((still) => resourceIdentity(context, still)),
            config.imageSeconds,
            config.zoomPercent,
            config.motionStyle,
            config.subtitles?.fontId ?? "default",
          ],
        },
        [pick.key, ...stills.map((still) => still.key)],
        { tokenKey: shortsPickKey },
      ),
    );
  }
  return recipes;
}

// The clips the pick saved, when its saved answer is the one this plan asks for.
export function savedPicks(
  context: RecipeContext,
  pick: ResolvedWorkRecipe,
): readonly ShortPick[] | undefined {
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === pick.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      row.fingerprint === pick.fingerprint,
  );
  if (piece?.piece.payload === undefined || piece.piece.payload === null) return undefined;
  const parsed = z
    .object({ shorts: z.array(shortPickSchema) })
    .safeParse(JSON.parse(piece.piece.payload));
  return parsed.success ? parsed.data.shorts : undefined;
}

// A clip's saved image prompts, when they answer this plan's request. The request carries
// the model's thinking settings from the catalogue, which the plan without a catalogue has
// not got, so either fingerprint matches (like `matchingText`).
function savedPrompts(
  context: RecipeContext,
  prompts: ResolvedWorkRecipe,
): readonly string[] | undefined {
  const logical =
    context.catalogue === undefined || prompts.input.kind !== "llm"
      ? prompts.fingerprint
      : recipe(
          { content: context.content },
          prompts.key,
          prompts.stage,
          { ...prompts.input, thinkingConfig: null },
          prompts.dependsOn,
          { tokenKey: shortsPickKey },
        ).fingerprint;
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === prompts.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      (row.fingerprint === prompts.fingerprint || row.fingerprint === logical),
  );
  if (piece?.piece.payload === undefined || piece.piece.payload === null) return undefined;
  const parsed = z
    .object({ prompts: z.array(z.string()) })
    .safeParse(JSON.parse(piece.piece.payload));
  return parsed.success ? parsed.data.prompts : undefined;
}
