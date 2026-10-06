import { sourceEntries } from "../article/source-lines.js";
import { splitEndMatter } from "../article/split.js";
import { type Block, markdownBlocks, markdownLinks, runsText } from "./blocks.js";

export interface SourceItem {
  readonly text: string;
  readonly href: string | null;
  // The words in `text` that link somewhere: a site's name standing for its address.
  readonly links?: readonly { readonly label: string; readonly href: string }[];
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
  return { blocks: markdownBlocks(parts.body), sources: [...listed, ...cited].map(tidySource) };
}

const addressPattern = /https?:\/\/[^\s)>\]]+/g;

// A source as a reader wants it: an entry's long address replaced by the site's name (the entry
// still links to it), and a bare address given a title read from the address itself.
export function tidySource(item: SourceItem): SourceItem {
  const bare = item.text.trim();
  if (item.href !== null && (bare === item.href || /^https?:\/\/\S+$/.test(bare))) {
    const site = siteOf(bare);
    const title = titleOf(bare);
    return {
      text: title === undefined ? site : `${title} — ${site}`,
      href: item.href,
      links: [{ label: site, href: item.href }],
    };
  }
  const addresses = [...item.text.matchAll(addressPattern)].map((match) =>
    match[0].replace(/[.,;:]+$/, ""),
  );
  if (addresses.length === 0) return item;
  // A site cited more than once in an entry is numbered, so each name still says which page.
  const seen = new Map<string, number>();
  const links = addresses.map((address) => {
    const site = siteOf(address);
    const count = (seen.get(site) ?? 0) + 1;
    seen.set(site, count);
    return { label: count === 1 ? site : `${site} (${String(count)})`, href: address };
  });
  let text = item.text;
  for (const [at, address] of addresses.entries())
    text = text.replace(address, links[at]?.label ?? address);
  return { text, href: item.href ?? addresses[0] ?? null, links };
}

// "en.wikipedia.org" from an address; the address itself when it isn't one.
function siteOf(address: string): string {
  try {
    return new URL(address).hostname.replace(/^www\./, "");
  } catch {
    return address;
  }
}

// Path parts that name a kind of page rather than the page.
const genericParts = new Set([
  "article",
  "articles",
  "blog",
  "card",
  "cards",
  "claim",
  "index",
  "item",
  "news",
  "page",
  "pages",
  "post",
  "posts",
  "product",
  "products",
  "source",
  "view",
  "watch",
  "wiki",
]);

// A page's title as its address spells it: the last path part that reads as words
// ("1700-who-is-vecna-and-why-must-he-die" → "Who is vecna and why must he die").
function titleOf(address: string): string | undefined {
  let parts: string[];
  try {
    parts = new URL(address).pathname.split("/").filter((part) => part !== "");
  } catch {
    return undefined;
  }
  for (const part of parts.toReversed()) {
    let decoded = part;
    try {
      decoded = decodeURIComponent(part);
    } catch {
      // A malformed escape: the part as written.
    }
    const words = decoded
      .replace(/\.(html?|php|aspx?|pdf)$/i, "")
      .replace(/[-_+]+/g, " ")
      .replace(/^\d+\s+/, "")
      .trim();
    if (
      !/[a-z]{3}/i.test(words) ||
      /^[a-z]{1,3}\d*$/i.test(words) ||
      genericParts.has(words.toLowerCase())
    )
      continue;
    return words.charAt(0).toUpperCase() + words.slice(1);
  }
  return undefined;
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
