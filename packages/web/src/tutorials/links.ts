import { githubSlug, headingText } from "@app/slices/tutorials/anchors.js";

// The wiki links its pages the GitHub way, `[text](Page-Name#section)`. In the app the same
// link opens Help → Tutorials at that page and section, so a page reads the same in both.

export const tutorialsPath = "/help/tutorials";

export function tutorialHref(page: string, anchor?: string): string {
  return `${tutorialsPath}/${encodeURIComponent(page)}${anchor ? `#${anchor}` : ""}`;
}

// `](Page)`, `](Page#anchor)` and `](#anchor)` become in-app addresses; outside links and
// pages this version does not have are left as they are.
export function rewriteTutorialLinks(
  markdown: string,
  pages: ReadonlySet<string>,
  current: string,
): string {
  return markdown.replace(
    /\]\(([A-Za-z0-9][A-Za-z0-9-]*)?(?:#([^)\s]*))?\)/g,
    (whole, page: string | undefined, anchor: string | undefined) => {
      if (page === undefined && anchor === undefined) return whole;
      const target = page ?? current;
      if (!pages.has(target)) return whole;
      return `](${tutorialHref(target, anchor)})`;
    },
  );
}

// The page's own `# Title` line, which the page header already shows, split from the rest.
export function splitTitle(markdown: string): {
  readonly title: string | undefined;
  readonly body: string;
} {
  const match = /^\s*#\s+(.+?)\s*#*\s*(?:\n|$)/.exec(markdown);
  if (match === null) return { title: undefined, body: markdown };
  return { title: match[1], body: markdown.slice(match[0].length) };
}

// An in-app tutorial address split back into its page and anchor, or undefined for any other.
export function parseTutorialHref(
  href: string,
): { readonly page: string; readonly anchor: string | undefined } | undefined {
  const match = /^\/help\/tutorials\/([^/#?]+)(?:#(.*))?$/.exec(href);
  if (match === null) return undefined;
  const anchor = match[2];
  return {
    page: decodeURIComponent(match[1] ?? ""),
    anchor: anchor === undefined || anchor === "" ? undefined : decodeURIComponent(anchor),
  };
}

// The rendered heading GitHub's anchor names: every heading's text is slugged the way GitHub
// does, a repeat numbered `-1`, `-2`, in the order they are on the page.
// `before` are headings of the page not drawn (its title, shown as the page header), counted
// first as GitHub counts them.
export function headingForAnchor(
  root: ParentNode,
  anchor: string,
  before: readonly string[] = [],
): HTMLElement | undefined {
  const seen = new Map<string, number>();
  for (const text of before) {
    const base = githubSlug(headingText(text));
    seen.set(base, (seen.get(base) ?? 0) + 1);
  }
  for (const heading of root.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")) {
    const base = githubSlug((heading.textContent ?? "").trim());
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    if ((count === 0 ? base : `${base}-${String(count)}`) === anchor) return heading;
  }
  return undefined;
}
