import { z } from "zod";
import { fingerprint } from "../../kernel/runner/work.js";
import { usesShorts } from "../admission/rules.js";
import { withoutScene } from "../images/scenes.js";
import { effectiveClips, type PickedShorts, pickedShortsOf } from "../shorts/clips.js";
import {
  defaultShortsImagePrompt,
  musicVolumeOf,
  shortImageCount,
  shortsSpeedOf,
} from "../shorts/model.js";
import type { ShortPick } from "../shorts/pick.js";
import { imagePromptMessages } from "../shorts/prompts.js";
import { type ImageAppearance, lookWait, withLooks } from "./recipe-appearance.js";
import { castFor } from "./recipe-cast.js";
import { type MasterPlan, noMaster } from "./recipe-loudness.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";
import { castField, type ImageReference, imageChoice } from "./recipe-reference.js";
import { llmInput, renderedPrompt } from "./recipe-text.js";

// The Shorts step unfolds as its answers land, the way research's chapters unfold from the
// plan. `shorts:pick` reads the word timing, so it waits for `subtitles:timing` and runs
// beside the render; until its saved answer matches, one deferred `shorts:future` stands in
// for everything after it (and carries the images' cost). Each picked clip then gets
// `shorts:N:prompts`, one LLM call writing its image prompts; once those match, its
// `shorts:N:image:M` images and its `shorts:N:render`.
//
// A clip's work carries the clip's own token (`clipToken`): the pick's token from when the
// clip was first picked, plus the one "Make this short again" renews under `shorts:N`. So
// picking the moments again redoes only the clips whose sentences changed, and one short
// can be made again alone.
export const shortsPickKey = "shorts:pick";
export const shortsFutureKey = "shorts:future";

export function shortsRecipes(
  context: RecipeContext,
  exports: readonly ResolvedWorkRecipe[],
  // The establishing image the shorts' images are drawn from, when it is on.
  reference?: ImageReference,
  // "Show tables and figures on screen": the cards a short shows where it describes one.
  cards: readonly ResolvedWorkRecipe[] = [],
  // Level the volume: the levelled narration and the master (`recipe-loudness.ts`).
  master: MasterPlan = noMaster,
  // How the figures look, for a shorts image prompt with `{{Appearance}}` (`recipe-appearance.ts`).
  appearance?: ImageAppearance,
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
        // The project language, only when it is not English, so English keeps its fingerprint.
        ...(config.language === undefined || config.language === "en" ? [] : [config.language]),
      ],
    },
    [timing.key],
    // A paid LLM call: readiness, the charge warning and the estimate treat it like one.
    { kind: "provider" },
  );
  const picked = savedPicked(context, pick);
  const images = config.images ?? { provider: "", model: "" };
  // A shorts image prompt may name `{{Scene}}` like the video's: the prompts call already writes
  // each image's moment from what the clip says, so that line is left out here.
  const style = shorts.imagePrompt?.trim()
    ? withoutScene(renderedPrompt(context, "shortsImage"))
    : defaultShortsImagePrompt;
  if (picked === undefined)
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
            // Only what is in use, so shorts planned before these existed keep their
            // fingerprint; the estimate reads the fields above by position.
            ...(config.images?.thinking === undefined ? [] : [config.images.thinking]),
            ...(reference === undefined ? [] : [reference.input.fingerprint]),
          ],
        },
        [pick.key],
        { tokenKey: shortsPickKey },
      ),
    ];
  const recipes: ResolvedWorkRecipe[] = [pick];
  const clips = effectiveClips(picked, context.content.shortsRanges, pick.fingerprint, shorts);
  for (const clip of clips) {
    const prefix = `shorts:${String(clip.number)}`;
    const token = clipToken(context, clip);
    const count = shortImageCount(clip.end - clip.start, config.imageSeconds);
    // The looks of the figures the clip names, and always the subject's: a short stands for
    // the video. Until they are looked up the clip's prompts wait for them.
    const looked = withLooks(style, appearance, clip.text, { subjectAlways: true });
    if (looked === null) {
      const wait = lookWait(style, appearance);
      recipes.push(
        recipe(
          context,
          `${prefix}:prompts`,
          "video",
          {
            kind: "deferred",
            version: 1,
            operation: "shorts",
            template: [...wait.template, style, clip.text, count],
          },
          [pick.key, ...wait.dependsOn],
          { token },
        ),
      );
      continue;
    }
    const prompts = {
      ...recipe(
        context,
        `${prefix}:prompts`,
        "video",
        llmInput(
          context,
          imagePromptMessages({
            style: looked,
            videoTitle: config.title,
            shortTitle: clip.title,
            text: clip.text,
            count,
            imageSeconds: config.imageSeconds,
          }),
        ),
        [pick.key],
        { token },
      ),
      unfoldsImages: { count, provider: images.provider, model: images.model },
    };
    recipes.push(prompts);
    const written = savedPrompts(context, prompts, token);
    if (written === undefined || written.length !== count) continue;
    const stills = written.map((prompt, index) =>
      recipe(
        context,
        `${prefix}:image:${String(index + 1)}`,
        "video",
        {
          kind: "image",
          version: 1,
          ...imageChoice(config),
          prompt,
          aspect: "9:16",
          ...(reference === undefined ? {} : { reference: reference.input }),
          ...castField(castFor(config, prompt)),
        },
        [prompts.key, ...(reference === undefined ? [] : [reference.key])],
        { token },
      ),
    );
    recipes.push(...stills);
    const extras = renderExtras(context, clip);
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
            // Only when one of the later settings is in use, so a short rendered before
            // they existed keeps its fingerprint.
            ...(extras === undefined ? [] : [extras]),
            // Only with cards, so a short rendered before them keeps its fingerprint.
            ...(cards.length === 0
              ? []
              : [["figure-cards-v1", cards.map((card) => resourceIdentity(context, card))]]),
            // Only while the volume is levelled, so every short without it keeps its fingerprint.
            ...master.values,
          ],
        },
        [
          pick.key,
          ...stills.map((still) => still.key),
          ...cards.map((card) => card.key),
          ...master.keys,
        ],
        { token },
      ),
    );
  }
  return recipes;
}

// What the render draws and plays beyond the clip itself: the title headline, a faster
// speed and the background music at its level. Undefined when none is in use.
export function renderExtras(
  context: Pick<RecipeContext, "config" | "content">,
  clip: Pick<ShortPick, "title">,
):
  | {
      readonly title?: string;
      readonly speed?: number;
      readonly music?: readonly [string, number];
    }
  | undefined {
  const shorts = context.config.shorts;
  if (shorts === undefined) return undefined;
  const speed = shortsSpeedOf(shorts);
  const music = context.content.shortsMusic;
  const extras = {
    ...(shorts.titleOnScreen === true ? { title: clip.title } : {}),
    ...(speed === 1 ? {} : { speed }),
    ...(music === undefined ? {} : { music: [music, musicVolumeOf(shorts)] as const }),
  };
  return Object.keys(extras).length === 0 ? undefined : extras;
}

// The token a clip's prompts, images and render carry: the pick's token from when the clip
// was first picked (the current one for a pick saved before clips kept theirs), with the
// clip's own "Make this short again" token when it has one.
export function clipToken(
  context: Pick<RecipeContext, "content">,
  clip: Pick<ShortPick, "number" | "seed">,
): string | null {
  const tokens = context.content.regenerationTokens;
  const base = clip.seed !== undefined ? clip.seed : (tokens[shortsPickKey] ?? null);
  const own = tokens[shortRemakeKey(clip.number)];
  return own === undefined ? base : fingerprint([base, own]);
}

// The regeneration key "Make this short again" renews for short N.
export function shortRemakeKey(number: number): string {
  return `shorts:${String(number)}`;
}

// What the pick saved, when its saved answer is the one this plan asks for.
export function savedPicked(
  context: RecipeContext,
  pick: ResolvedWorkRecipe,
): PickedShorts | undefined {
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === pick.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      row.fingerprint === pick.fingerprint,
  );
  return pickedShortsOf(piece?.piece.payload);
}

// A clip's saved image prompts, when they answer this plan's request. The request carries
// the model's thinking settings from the catalogue, which the plan without a catalogue has
// not got, so either fingerprint matches (like `matchingText`).
function savedPrompts(
  context: RecipeContext,
  prompts: ResolvedWorkRecipe,
  token: string | null,
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
          { token },
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
