import { remark } from "remark";
import remarkGfm from "remark-gfm";
import stripMarkdown from "strip-markdown";

// `logic/05` §Q37 and `logic/07` step 4: the article is stored twice, as the markdown the
// model wrote and as the plain text the narration is read from, so no TTS voice ever says
// a hash or a bracket. remark parses and strip-markdown drops the formatting; the GFM
// extension is what makes a table a table rather than a paragraph full of pipes, and what
// takes a footnote marker out of the middle of a sentence.

export function plainText(markdown: string): string {
  // Built per call: a shared processor would be a module-level singleton, and building
  // one costs a few microseconds against a call that just parsed an article.
  const stripped = remark().use(remarkGfm).use(stripMarkdown).processSync(markdown);
  return String(stripped);
}
