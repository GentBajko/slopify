import { sourceEntries } from "../article/source-lines.js";
import { splitEndMatter } from "../article/split.js";
import { type Block, markdownBlocks, markdownLinks, runsText } from "./blocks.js";

export interface SourceItem {
  readonly text: string;
  readonly href: string | null;
}

export interface DocumentText {
  // The article without its end matter, as printable blocks.
  readonly blocks: readonly Block[];
  // The Sources page: the article's "Sources Consulted" section, then any other link the
  // research notes cite.
  readonly sources: readonly SourceItem[];
}

// The pronunciation glossary is narration's business and is left out; the sources section
// becomes the Sources page instead of being printed as body text.
export function documentText(articleMarkdown: string, researchNotes: string | null): DocumentText {
  const parts = splitEndMatter(articleMarkdown);
  const listed = sourceItems(parts.sources);
  const seen = new Set(listed.flatMap((item) => (item.href === null ? [] : [item.href])));
  const cited: SourceItem[] = [];
  for (const link of researchNotes === null ? [] : markdownLinks(researchNotes)) {
    if (seen.has(link.href) || !/^https?:\/\//i.test(link.href)) continue;
    seen.add(link.href);
    cited.push(link.text === link.href ? { text: link.href, href: link.href } : link);
  }
  return { blocks: markdownBlocks(parts.body), sources: [...listed, ...cited] };
}

function sourceItems(section: string): readonly SourceItem[] {
  return sourceEntries(section).flatMap((entry): readonly SourceItem[] => {
    const runs = markdownBlocks(entry).flatMap((block) => ("runs" in block ? block.runs : []));
    const text = runsText(runs).trim();
    if (text === "") return [];
    const href =
      runs.find((run) => run.href !== null)?.href ??
      /https?:\/\/[^\s)>\]]+/.exec(text)?.[0] ??
      null;
    return [{ text, href }];
  });
}
