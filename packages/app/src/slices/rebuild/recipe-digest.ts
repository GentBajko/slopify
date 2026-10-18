import { withLanguage } from "../../kernel/ports/languages.js";
import { subjectOf } from "../admission/model.js";
import { type Digest, digestMessages, digestNames } from "../keywords/digest.js";
import { keywordUsesOf } from "../keywords/rules.js";
import type { KeywordProducer } from "./recipe-keywords.js";
import {
  type RecipeContext,
  type ResolvedWorkRecipe,
  recipe,
  selectedReference,
} from "./recipe-model.js";
import { llmInput, llmInputFingerprint } from "./recipe-text.js";
import { keywordBodies } from "./recipe-validation.js";

export const digestKey = "article:digest";

// The keyword digest step, only while a prompt the version runs uses a digest keyword, and the
// digest it wrote once it answers this plan's request. It reads the article the pictures are
// drawn from, so editing the article by hand keeps it with them.
export function keywordDigest(
  context: RecipeContext,
  text: { readonly pictureText: string | null; readonly article: ResolvedWorkRecipe },
): { readonly recipe: ResolvedWorkRecipe; readonly producer: KeywordProducer } | undefined {
  const { config } = context;
  if (keywordUsesOf(keywordBodies(config, context.content)).digest === undefined) return undefined;
  const messages = withLanguage(
    digestMessages({ title: subjectOf(config), article: text.pictureText ?? "" }),
    config.language,
  );
  const value = recipe(
    context,
    digestKey,
    "article",
    text.pictureText === null
      ? {
          kind: "deferred",
          version: 1,
          operation: "keyword-digest",
          template: [llmInputFingerprint(context, messages), text.article.fingerprint],
        }
      : llmInput(context, messages),
    [text.article.key],
  );
  return {
    recipe: value,
    producer: {
      key: value.key,
      fingerprint: value.fingerprint,
      names: digestNames,
      values: text.pictureText === null ? undefined : savedDigest(context, value),
    },
  };
}

// The digest saved for this request, by either fingerprint (see `savedScenes`).
function savedDigest(context: RecipeContext, value: ResolvedWorkRecipe): Digest | undefined {
  const logical =
    context.catalogue === undefined || value.input.kind !== "llm"
      ? value.fingerprint
      : recipe(
          { content: context.content },
          value.key,
          value.stage,
          { ...value.input, thinkingConfig: null },
          value.dependsOn,
        ).fingerprint;
  const piece = context.manifest.pieces.find(
    (row) =>
      row.key === value.key &&
      selectedReference(row) &&
      row.piece.state === "done" &&
      (row.fingerprint === value.fingerprint || row.fingerprint === logical),
  );
  if (piece?.piece.payload == null) return undefined;
  const payload = JSON.parse(piece.piece.payload) as { digest?: unknown };
  const digest = payload.digest;
  if (typeof digest !== "object" || digest === null) return undefined;
  const values: Record<string, string> = {};
  for (const name of digestNames) {
    const one: unknown = (digest as Record<string, unknown>)[name];
    if (typeof one !== "string") return undefined;
    values[name] = one;
  }
  return values;
}
