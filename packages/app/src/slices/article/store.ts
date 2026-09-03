import type { TextStoreDeps } from "../storage/staging.js";
import { storeText } from "../storage/staging.js";
import { plainText } from "./plain.js";
import { splitEndMatter } from "./split.js";

// `logic/08` step 1: the end-matter split runs "when the article becomes `done` or
// `provided`", so both the stage that writes an article and Play, which attaches a pasted
// one, reduce it the same way. The reduction lives here rather than in either caller
// because a rule that ran on one path and not the other is exactly the defect this fixes.

export interface ArticleTextInput {
  readonly projectId: string;
  readonly markdown: string;
}

// The narration source it stored, so a caller that needs the article as it will be spoken
// - `logic/07` step 5 writes the intro and outro from it - does not read the file back.
export function storeArticleText(deps: TextStoreDeps, input: ArticleTextInput): string {
  const end = splitEndMatter(input.markdown);
  const store = { projectId: input.projectId, stageKind: "article" } as const;
  // `logic/05` §Q37's invariant: "the narration source of an article is always plain
  // text", so no voice ever says a hash or a bracket, whoever wrote the markdown.
  const narration = plainText(end.body);
  storeText(deps, { ...store, role: "article_txt", text: narration });
  // §Q63: no such heading means no file, not an empty one.
  if (end.sources.trim() !== "") {
    storeText(deps, { ...store, role: "sources", text: end.sources });
  }
  if (end.glossary.trim() !== "") {
    storeText(deps, { ...store, role: "glossary", text: end.glossary });
  }
  return narration;
}
