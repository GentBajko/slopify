import { z } from "zod";
import type { TimedWord } from "../../kernel/ports/subtitles.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { usesYoutubeDescription } from "../admission/rules.js";
import { headingChapters, type TimedChapter, topHeadings } from "../video/chapters.js";
import { chapterOpeningShots, sentenceCutPoints } from "../video/cuts.js";
import {
  animatedClipSeconds,
  animatedImageIndexes,
  animatePrompt,
  editNeedsTiming,
  usesAnimation,
  usesChapterCards,
  usesNarrationCuts,
  videoEditOf,
} from "../video/edit-settings.js";
import { fps } from "../video/plan.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  resourceIdentity,
  selectedReference,
} from "./recipe-model.js";

// What the Video stage's edit settings add to the plan: the word timing and chapters the
// render reads, and a paid `animate:<image>` request for each image brought to life. Every
// setting left at today's behaviour adds nothing, so a project without them, or with them all
// off, plans the same export fingerprint it always did and no finished video turns outdated.
//
// "Chapter openers" can only be told once the word timing (and the YouTube chapters, when
// that step runs) has landed, so until then one deferred `animate:future` stands in for the
// requests and carries their cost, the way `shorts:future` does.
export const animateFutureKey = "animate:future";

export interface EditPlan {
  // Planned before the export, which waits for them.
  readonly recipes: readonly ResolvedWorkRecipe[];
  // Appended to the export's fingerprint values; empty for today's slideshow.
  readonly values: readonly FingerprintValue[];
  // The export waits for these too.
  readonly dependsOn: readonly string[];
}

export function editPlan(
  context: RecipeContext,
  exports: readonly ResolvedWorkRecipe[],
  youtube: readonly ResolvedWorkRecipe[],
  images: readonly ResolvedWorkRecipe[],
): EditPlan {
  const { config } = context;
  const edit = videoEditOf(config);
  if (config.sources.video !== "generate") return { recipes: [], values: [], dependsOn: [] };
  const timing = editNeedsTiming(config)
    ? exports.find((value) => value.key === "subtitles:timing")
    : undefined;
  const description = youtube.find((value) => value.key === "youtube:description");
  const fromDescription = usesYoutubeDescription(config) && description !== undefined;
  const values: FingerprintValue[] = [];
  const dependsOn: string[] = [];
  if (usesNarrationCuts(config)) values.push(["cuts", "narration-v1"]);
  if (edit.transition !== "cut")
    values.push(["transition", edit.transition, edit.transitionSeconds]);
  if (
    edit.vignette !== "off" ||
    edit.grain !== "off" ||
    edit.grade !== "none" ||
    edit.atmosphere !== "none"
  )
    values.push(["look-v1", edit.vignette, edit.grain, edit.grade, edit.atmosphere]);
  if (usesChapterCards(config)) values.push(["cards-v1", config.subtitles?.fontId ?? "default"]);
  // The brand kit's end screen and title style; nothing when unset, so a project without them
  // keeps its export fingerprint.
  const endScreen = config.endScreen?.text.trim() ?? "";
  if (endScreen !== "") values.push(["end-screen-v1", endScreen]);
  if (config.titleStyle !== undefined && (usesChapterCards(config) || endScreen !== ""))
    values.push(["title-style", config.titleStyle.fontId ?? null, config.titleStyle.color ?? null]);
  if (timing !== undefined) {
    values.push(["timing", resourceIdentity(context, timing)]);
    dependsOn.push(timing.key);
    if (fromDescription && description !== undefined) {
      values.push(["chapters", resourceIdentity(context, description)]);
      dependsOn.push(description.key);
    } else values.push(["chapters", "headings", headingsIdentity(context)]);
  }
  const recipes = usesAnimation(config)
    ? animateRecipes(context, images, timing, fromDescription ? description : undefined)
    : [];
  if (recipes.length > 0) {
    values.push(["animate-v1", recipes.map((value) => value.fingerprint)]);
    dependsOn.push(...recipes.map((value) => value.key));
  }
  return { recipes, values, dependsOn };
}

function animateRecipes(
  context: RecipeContext,
  images: readonly ResolvedWorkRecipe[],
  timing: ResolvedWorkRecipe | undefined,
  description: ResolvedWorkRecipe | undefined,
): readonly ResolvedWorkRecipe[] {
  const { config, content } = context;
  const edit = videoEditOf(config);
  const provider = config.images?.provider ?? "";
  // Only images the project draws are animated; an uploaded picture or clip is shown as it
  // was given.
  const drawn = (index: number): boolean => {
    const key = content.imageOrder[index];
    return key !== undefined && content.imageDefinitions[key]?.source === "generate";
  };
  let indexes: readonly number[];
  if (edit.animate === "every") indexes = animatedImageIndexes(edit, content.imageOrder.length);
  else {
    const opening = openingImages(context, timing, description);
    if (opening === undefined) {
      const upper = Math.min(
        content.imageOrder.filter((_key, index) => drawn(index)).length,
        chapterEstimate(context),
      );
      return [
        recipe(
          context,
          animateFutureKey,
          "video",
          {
            kind: "deferred",
            version: 1,
            operation: "animate",
            template: [
              timing?.fingerprint ?? null,
              description?.fingerprint ?? null,
              provider,
              edit.animateModel,
              upper,
            ],
          },
          [
            ...(timing === undefined ? [] : [timing.key]),
            ...(description ? [description.key] : []),
          ],
        ),
      ];
    }
    indexes = opening;
  }
  return indexes.filter(drawn).flatMap((index) => {
    const key = content.imageOrder[index];
    const still = images.find((value) => value.key === `image:${key ?? ""}`);
    if (key === undefined || still === undefined) return [];
    return [
      recipe(
        context,
        `animate:${key}`,
        "video",
        {
          kind: "image",
          version: 1,
          provider,
          model: edit.animateModel,
          prompt: animatePrompt,
          aspect: config.format,
          animate: { image: still.fingerprint, seconds: animatedClipSeconds },
        },
        [still.key],
        { unresolved: still.unresolved },
      ),
    ];
  });
}

// The images (0-based, in slideshow order) the video and its chapters open on, once the word
// timing and chapters are saved; undefined until then.
function openingImages(
  context: RecipeContext,
  timing: ResolvedWorkRecipe | undefined,
  description: ResolvedWorkRecipe | undefined,
): readonly number[] | undefined {
  const count = context.content.imageOrder.length;
  if (count === 0) return [];
  const words = timing === undefined ? undefined : savedWords(context, timing);
  if (words === undefined) return undefined;
  const chapters =
    description === undefined
      ? headingChapters(context.resolved.articleMarkdown ?? "", words)
      : savedChapters(context, description);
  if (chapters === undefined) return undefined;
  const shots = chapterOpeningShots({
    fps,
    imageSeconds: context.config.imageSeconds,
    narration: usesNarrationCuts(context.config),
    cutPoints: sentenceCutPoints(words),
    chapterStarts: chapters.map((chapter) => chapter.start),
  });
  return [...new Set(shots.map((shot) => shot % count))];
}

const wordsPayload = z.object({
  words: z.array(z.object({ text: z.string(), start: z.number(), end: z.number() })),
});
const chaptersPayload = z.object({
  chapters: z.array(z.object({ start: z.number(), title: z.string() })),
});

function savedPayload(context: RecipeContext, value: ResolvedWorkRecipe): unknown | undefined {
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === value.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      row.fingerprint === value.fingerprint,
  );
  if (piece?.piece.payload === undefined || piece.piece.payload === null) return undefined;
  try {
    return JSON.parse(piece.piece.payload);
  } catch {
    return undefined;
  }
}

function savedWords(
  context: RecipeContext,
  timing: ResolvedWorkRecipe,
): readonly TimedWord[] | undefined {
  const parsed = wordsPayload.safeParse(savedPayload(context, timing));
  return parsed.success ? parsed.data.words : undefined;
}

function savedChapters(
  context: RecipeContext,
  description: ResolvedWorkRecipe,
): readonly TimedChapter[] | undefined {
  const parsed = chaptersPayload.safeParse(savedPayload(context, description));
  return parsed.success ? parsed.data.chapters : undefined;
}

// The article's chapter headings, which decide where heading chapters fall; null while the
// article is not written yet.
function headingsIdentity(context: RecipeContext): FingerprintValue {
  const markdown = context.resolved.articleMarkdown;
  return markdown === null ? null : fingerprint(topHeadings(markdown).map((one) => one.title));
}

// ceiling: how many chapters "Chapter openers" is charged for before they are known: the
// article's headings and the opening, or twelve (the most a YouTube description is asked for)
// while the article is not written yet.
function chapterEstimate(context: RecipeContext): number {
  const markdown = context.resolved.articleMarkdown;
  return markdown === null ? 12 : topHeadings(markdown).length + 1;
}
