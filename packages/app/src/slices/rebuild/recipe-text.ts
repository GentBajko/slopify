import { z } from "zod";
import type { Message } from "../../kernel/ports/llm.js";
import { type FingerprintValue, fingerprint } from "../../kernel/runner/work.js";
import { render } from "../admission/substitute.js";
import { articleMessages, continuationMessages } from "../article/continuation.js";
import { plainText } from "../article/plain.js";
import { segmentMessages } from "../article/segments.js";
import { splitEndMatter } from "../article/split.js";
import { plannerMessages, subAgentMessages } from "../research/planner.js";
import { synthesisMessages } from "../research/synthesis.js";
import { thumbnailMessages } from "../thumbnail/by-llm.js";
import {
  type RecipeContext,
  type RecipeInput,
  type ResolvedWorkRecipe,
  recipe,
  selectedReference,
} from "./recipe-model.js";

export function renderedPrompt(context: RecipeContext, key: string): string {
  const raw = context.content.promptTemplates[key];
  return raw === undefined || raw === null
    ? (context.config.rendered[key] ?? "")
    : render(raw, context.config.values);
}
export function llmInput(
  context: RecipeContext,
  messages: readonly Message[],
  webSearch = false,
): RecipeInput & { readonly kind: "llm" } {
  const choice = context.config.llm;
  const model = context.catalogue?.llm.find(
    (row) =>
      row.provider === choice?.provider &&
      row.id === choice.model &&
      row.enabled &&
      !row.deprecated,
  );
  return {
    kind: "llm",
    version: 1,
    provider: choice?.provider ?? "",
    model: choice?.model ?? "",
    thinking: choice?.thinking ?? null,
    thinkingConfig:
      choice?.thinking === undefined ? null : (model?.llm.thinking?.[choice.thinking] ?? null),
    messages,
    webSearch,
  };
}
export function selectedText(
  context: RecipeContext,
  key: string,
  field: "text" | "prompt",
): string | null {
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === key &&
      selectedReference(row) &&
      row.stageKind === (key.startsWith("entry:") ? "article" : "thumbnail") &&
      row.piece.state === "done",
  );
  if (piece?.piece.payload === null || piece === undefined) return null;
  const parsed = z
    .object({ text: z.string().optional(), prompt: z.string().optional() })
    .parse(JSON.parse(piece.piece.payload));
  return parsed[field]?.trim() ?? null;
}
export interface TextRecipes {
  readonly recipes: readonly ResolvedWorkRecipe[];
  readonly articleText: string | null;
  readonly article: ResolvedWorkRecipe;
  readonly entries: Readonly<
    Partial<
      Record<
        "intro" | "outro",
        { readonly recipe: ResolvedWorkRecipe; readonly text: string | null }
      >
    >
  >;
}
export function textRecipes(context: RecipeContext): TextRecipes {
  const { config, content, resolved } = context;
  const recipes: ResolvedWorkRecipe[] = [];
  const brief = { articlePrompt: renderedPrompt(context, "article"), values: config.values };
  let research: ResolvedWorkRecipe | undefined;
  if (config.sources.research === "generate") {
    const planner = recipe(
      context,
      "research:planner",
      "research",
      llmInput(context, plannerMessages(brief)),
    );
    recipes.push(planner);
    const chapters =
      resolved.research?.outline.map((title, index) =>
        recipe(
          context,
          `research:chapter:${index + 1}`,
          "research",
          llmInput(context, subAgentMessages(brief, title, resolved.research?.outline ?? []), true),
          [planner.key],
        ),
      ) ?? [];
    recipes.push(...chapters);
    const findings = resolved.research?.findings;
    research =
      findings !== undefined && findings.length === chapters.length && chapters.length > 0
        ? recipe(
            context,
            "research:notes",
            "research",
            llmInput(context, synthesisMessages(brief, findings)),
            chapters.map((row) => row.key),
          )
        : recipe(
            context,
            "research:notes",
            "research",
            {
              kind: "deferred",
              version: 1,
              operation: "research-synthesis",
              template: [planner.fingerprint, chapters.map((row) => row.fingerprint)],
            },
            [planner.key, ...chapters.map((row) => row.key)],
          );
    recipes.push(research);
  } else if (config.sources.research === "provide") {
    research = recipe(context, "research:notes", "research", {
      kind: "local",
      version: 1,
      operation: "provided-notes",
      values: config.provided.research ?? "",
    });
    recipes.push(research);
  }
  const articleMarkdown =
    config.sources.article === "provide" || content.articleEdited === true
      ? (content.articleMarkdown ?? config.provided.article ?? "")
      : resolved.articleMarkdown;
  const notes =
    config.sources.research === "off"
      ? null
      : config.sources.research === "provide"
        ? (config.provided.research ?? null)
        : resolved.researchNotes;
  const messages = articleMessages({
    articlePrompt: brief.articlePrompt,
    ...(notes === null ? {} : { notes }),
  });
  const article =
    config.sources.article === "provide" || content.articleEdited === true
      ? recipe(context, "article:body", "article", {
          kind: "local",
          version: 1,
          operation: content.articleEdited ? "manual-article" : "provided-article",
          values: articleMarkdown,
        })
      : recipe(
          context,
          "article:body",
          "article",
          config.sources.research === "generate" && notes === null
            ? {
                kind: "deferred",
                version: 1,
                operation: "article",
                template: [llmInputFingerprint(context, messages), research?.fingerprint ?? null],
              }
            : llmInput(context, messages),
          research === undefined ? [] : [research.key],
        );
  recipes.push(article);
  if (
    resolved.articleContinuation !== undefined &&
    config.sources.article === "generate" &&
    !content.articleEdited
  )
    recipes.push(
      recipe(
        context,
        "article:continuation",
        "article",
        llmInput(context, continuationMessages(messages, resolved.articleContinuation)),
        [article.key],
      ),
    );
  const articleText =
    articleMarkdown === null ? null : plainText(splitEndMatter(articleMarkdown).body);
  const entries: Partial<
    Record<"intro" | "outro", { recipe: ResolvedWorkRecipe; text: string | null }>
  > = {};
  for (const category of ["intro", "outro"] as const) {
    const choice = config[category];
    if (choice === undefined || config.sources.audio !== "generate") continue;
    const prompt = renderedPrompt(context, category);
    const key = `entry:${category}:text`;
    const input: RecipeInput =
      choice.mode === "text"
        ? { kind: "local", version: 1, operation: "entry-text", values: prompt }
        : articleText === null
          ? {
              kind: "deferred",
              version: 1,
              operation: key,
              template: [
                llmInputFingerprint(context, segmentMessages(prompt, config, "")),
                article.fingerprint,
              ],
            }
          : llmInput(context, segmentMessages(prompt, config, articleText));
    const value = recipe(
      context,
      key,
      "article",
      input,
      choice.mode === "llm" ? [article.key] : [],
    );
    recipes.push(value);
    entries[category] = {
      recipe: value,
      text: choice.mode === "text" ? prompt : matchingText(context, value, "text"),
    };
  }
  if (config.sources.thumbnail === "prompt_by_llm") {
    const prompt = renderedPrompt(context, "thumbnailPrompt");
    const messages = thumbnailMessages({
      instruction: prompt,
      title: config.title,
      values: config.values,
      format: config.format,
      article: articleText ?? "",
    });
    recipes.push(
      recipe(
        context,
        "thumbnail:prompt",
        "thumbnail",
        articleText === null
          ? {
              kind: "deferred",
              version: 1,
              operation: "thumbnail-prompt",
              template: [llmInputFingerprint(context, messages), article.fingerprint],
            }
          : llmInput(context, messages),
        [article.key],
      ),
    );
  }
  return { recipes, articleText, article, entries };
}
function llmInputFingerprint(context: RecipeContext, messages: readonly Message[]): string {
  return fingerprint(JSON.parse(JSON.stringify(llmInput(context, messages))) as FingerprintValue);
}
export function matchingText(
  context: RecipeContext,
  value: ResolvedWorkRecipe,
  field: "text" | "prompt",
): string | null {
  const logical =
    context.catalogue === undefined
      ? value.fingerprint
      : recipe(
          { content: context.content },
          value.key,
          value.stage,
          value.input.kind === "llm" ? { ...value.input, thinkingConfig: null } : value.input,
          value.dependsOn,
        ).fingerprint;
  if (
    !context.manifest.pieces.some(
      (row) =>
        row.key === value.key &&
        selectedReference(row) &&
        (row.fingerprint === value.fingerprint || row.fingerprint === logical),
    )
  )
    return null;
  return selectedText(context, value.key, field);
}
