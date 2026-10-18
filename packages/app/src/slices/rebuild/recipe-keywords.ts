import { subjectOf } from "../admission/model.js";
import { detectSlots } from "../admission/substitute.js";
import { splitEndMatter } from "../article/split.js";
import { fillKeywords, mentionsKeyword } from "../keywords/fill.js";
import type { KeywordPlace } from "../keywords/model.js";
import { placeOfKey } from "../keywords/rules.js";
import { keywordOf } from "../keywords/specs.js";
import { factValues } from "../keywords/values.js";
import { topHeadings } from "../video/chapters.js";
import { usesScriptPrompt } from "../voices/model.js";
import type { RecipeContext } from "./recipe-model.js";

// A step whose answer some keywords are filled from: the article for the chapters, the keyword
// digest for the rest. `values` is undefined until it has answered this plan's request.
export interface KeywordProducer {
  readonly key: string;
  readonly fingerprint: string;
  readonly names: readonly string[];
  readonly values: Readonly<Record<string, string>> | undefined;
}

export interface KeywordState {
  readonly producers: readonly KeywordProducer[];
}

export interface FilledPrompt {
  readonly text: string;
  // The steps it still waits on, so its request can name them while it waits.
  readonly waits: readonly Pick<KeywordProducer, "key" | "fingerprint">[];
  // The steps whose answers it uses, written or not: it runs after them.
  readonly dependsOn: readonly string[];
}

export const articleKey = "article:body";

// The article as this version has it, or null while it is still to be written.
export function articleMarkdownOf(context: RecipeContext): string | null {
  const { config, content, resolved } = context;
  return config.sources.article !== "generate" || content.articleEdited === true
    ? (content.articleMarkdown ?? config.provided.article ?? "")
    : resolved.articleMarkdown;
}

// The article's chapter titles, once it is written.
export function chaptersProducer(
  markdown: string | null,
  article: { readonly key: string; readonly fingerprint: string },
): KeywordProducer {
  return {
    key: article.key,
    fingerprint: article.fingerprint,
    names: ["Slopify_Chapters"],
    values:
      markdown === null
        ? undefined
        : {
            Slopify_Chapters: topHeadings(splitEndMatter(markdown).body)
              .map((heading) => heading.title)
              .join("\n"),
          },
  };
}

// A prompt with its keywords filled. A text without a `Slopify_` keyword is returned as the very
// string it was, so a project that uses none plans the requests it always did.
export function fillPrompt(
  context: RecipeContext,
  text: string,
  place: KeywordPlace | undefined,
): FilledPrompt {
  if (place === undefined || !mentionsKeyword(text)) return { text, waits: [], dependsOn: [] };
  const producers = context.keywords?.producers ?? [
    chaptersProducer(articleMarkdownOf(context), { key: articleKey, fingerprint: "" }),
  ];
  const values: Record<string, string> = {
    ...factValues(context.config.keywordFacts, subjectOf(context.config), place),
  };
  const used = new Set<string>();
  for (const producer of producers)
    for (const name of producer.names)
      if (usesName(text, name, place)) {
        used.add(producer.key);
        const value = producer.values?.[name];
        if (value !== undefined) values[name] = value;
      }
  const filled = fillKeywords(text, place, values);
  const dependsOn = producers.filter((one) => used.has(one.key)).map((one) => one.key);
  if (filled.ok) return { text: filled.text, waits: [], dependsOn };
  return {
    text,
    waits: producers
      .filter((one) => one.names.some((name) => filled.waiting.includes(name)))
      .map((one) => ({ key: one.key, fingerprint: one.fingerprint })),
    dependsOn,
  };
}

// A picked prompt (`library/slots.ts` names its key), rendered and filled.
export function filledPrompt(context: RecipeContext, key: string, rendered: string): FilledPrompt {
  return fillPrompt(
    context,
    rendered,
    placeOfKey(key, { script: usesScriptPrompt(context.config) }),
  );
}

function usesName(text: string, name: string, place: KeywordPlace): boolean {
  return (
    detectSlots(text).names.includes(name) && (keywordOf(name)?.places.includes(place) ?? false)
  );
}
