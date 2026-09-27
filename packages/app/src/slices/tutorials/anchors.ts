// The tutorials are the GitHub wiki's pages (docs/wiki), so their links name sections the way
// GitHub does: `[text](Page-Name#section-anchor)`. These helpers work out those anchors, for
// the server's search, the web page that scrolls to them and the test that checks every help
// entry's Learn more link. Pure: the web bundle imports this file.

export const tutorialPageIdPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,79}$/;

// A heading's text as GitHub renders it: link targets, code ticks and emphasis marks dropped.
export function headingText(markdown: string): string {
  return markdown
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\p{L}\p{N}])[*_]([^*_]+)[*_](?![\p{L}\p{N}])/gu, "$1$2")
    .replace(/<[^>]+>/g, "")
    .trim();
}

// GitHub's anchor for a heading's text: lower case, punctuation dropped, each space a hyphen.
export function githubSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\p{M} _-]/gu, "")
    .replace(/ /g, "-");
}

const headingLine = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;

export interface TutorialHeading {
  readonly level: number;
  readonly text: string;
  readonly anchor: string;
  // The line the heading is on, from 0.
  readonly line: number;
}

// Every heading of a page in order, with GitHub's anchor; a repeated anchor gets `-1`, `-2`.
// `#` inside fenced code is not a heading.
export function tutorialHeadings(markdown: string): readonly TutorialHeading[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const seen = new Map<string, number>();
  const headings: TutorialHeading[] = [];
  let fenced = false;
  for (const [line, raw] of lines.entries()) {
    if (/^\s*(```|~~~)/.test(raw)) fenced = !fenced;
    const match = fenced ? null : headingLine.exec(raw);
    if (match === null) continue;
    const text = headingText(match[2] ?? "");
    const base = githubSlug(text);
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    headings.push({
      level: (match[1] ?? "#").length,
      text,
      anchor: count === 0 ? base : `${base}-${String(count)}`,
      line,
    });
  }
  return headings;
}

// The anchors a page offers, for checking a link.
export function tutorialAnchors(markdown: string): ReadonlySet<string> {
  return new Set(tutorialHeadings(markdown).map((heading) => heading.anchor));
}

// A page id as a title when the sidebar gives none: "Play-Overview" → "Play Overview".
export function pageTitleOf(id: string): string {
  return id.replace(/-/g, " ");
}
