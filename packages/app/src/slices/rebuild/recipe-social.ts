import { withLanguage } from "../../kernel/ports/languages.js";
import { subjectOf } from "../admission/model.js";
import { socialPlatforms } from "../social/model.js";
import { postMessages, postTarget } from "../social/post-prompt.js";
import { type RecipeContext, type ResolvedWorkRecipe, recipe } from "./recipe-model.js";
import { llmInput, llmInputFingerprint, promptOf, type TextRecipes } from "./recipe-text.js";

export const socialPostKey = (platform: string): string => `social:post:${platform}`;
export const socialPromptKey = (platform: string): string => `social.${platform}`;

// One post per site whose text comes from a post prompt (`config.social`): a paid call to the
// project's text model that reads the article. Every other text source is free and made when
// the pack is read, so a project without a post prompt plans exactly what it did before. The
// request waits for the article, and for the keywords its prompt uses.
export function socialRecipes(
  context: RecipeContext,
  text: Pick<TextRecipes, "articleText" | "article">,
): readonly ResolvedWorkRecipe[] {
  const { config } = context;
  return socialPlatforms.flatMap((platform) => {
    const choice = config.social?.[platform];
    if (choice?.text !== "prompt") return [];
    const target = postTarget(platform);
    const prompt =
      choice.prompt?.trim() === undefined || choice.prompt.trim() === ""
        ? undefined
        : promptOf(context, socialPromptKey(platform));
    const messages = withLanguage(
      postMessages({
        instruction: prompt?.text ?? "",
        target,
        title: subjectOf(config),
        article: text.articleText ?? "",
      }),
      config.language,
    );
    const ready = text.articleText !== null && (prompt?.waits.length ?? 0) === 0;
    return [
      recipe(
        context,
        socialPostKey(platform),
        "video",
        ready
          ? { ...llmInput(context, messages), social: target }
          : {
              kind: "deferred",
              version: 1,
              operation: "social-post",
              template: [
                llmInputFingerprint(context, messages),
                text.article.fingerprint,
                platform,
                ...(prompt?.waits ?? []).map((one) => one.fingerprint),
              ],
            },
        [text.article.key, ...(prompt?.dependsOn ?? [])],
      ),
    ];
  });
}
