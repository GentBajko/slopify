import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { pageTitleOf, tutorialHeadings, tutorialPageIdPattern } from "./anchors.js";

// Help → Tutorials: the GitHub wiki's pages, kept in the repository's docs/wiki/ and copied
// into the build beside the compiled code (scripts/copy-assets.mjs), so they read offline and
// always describe the version that is running. `_Sidebar.md` groups them, `_Footer.md` closes
// every page. Nothing here writes: the pages are part of the release.

export interface TutorialPageSummary {
  readonly id: string;
  readonly title: string;
}

export interface TutorialGroup {
  readonly title: string;
  readonly pages: readonly TutorialPageSummary[];
}

export interface TutorialsIndex {
  // The page the sidebar's first link opens ("Home").
  readonly home: TutorialPageSummary;
  readonly groups: readonly TutorialGroup[];
  // Every page, in sidebar order, then any the sidebar leaves out.
  readonly pages: readonly TutorialPageSummary[];
  readonly footer: string;
}

export interface TutorialHit {
  readonly page: string;
  readonly pageTitle: string;
  // GitHub's anchor of the section; "" for the text above the first heading.
  readonly anchor: string;
  readonly heading: string | undefined;
  readonly snippet: string;
}

export interface TutorialBook {
  readonly index: TutorialsIndex;
  readonly pages: ReadonlyMap<string, string>;
}

// dist/tutorials when running the build; the repository's docs/wiki when running from source
// (tests, `tsx`).
export function bundledTutorialsDir(): string {
  const candidates = ["../../tutorials/", "../../../../../docs/wiki/"].map((path) =>
    fileURLToPath(new URL(path, import.meta.url)),
  );
  return candidates.find((dir) => existsSync(join(dir, "Home.md"))) ?? (candidates[0] as string);
}

export class TutorialsMissing extends Error {}

// `[Title](Page-Name)` links of the sidebar, under its `**Group**` lines. The first link
// before any group is the home page.
export function parseSidebar(
  markdown: string,
  titleOf: (id: string) => string | undefined = () => undefined,
): { readonly home: TutorialPageSummary | undefined; readonly groups: readonly TutorialGroup[] } {
  const groups: { title: string; pages: TutorialPageSummary[] }[] = [];
  let home: TutorialPageSummary | undefined;
  for (const line of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    const group = /^\s*\*\*([^*[\]]+)\*\*\s*$/.exec(line);
    if (group !== null) {
      groups.push({ title: (group[1] ?? "").trim(), pages: [] });
      continue;
    }
    for (const link of line.matchAll(/\[([^\]]+)\]\(([^)#\s]+)\)/g)) {
      const id = link[2] ?? "";
      if (!tutorialPageIdPattern.test(id)) continue;
      const page = { id, title: (link[1] ?? titleOf(id) ?? pageTitleOf(id)).trim() };
      const last = groups[groups.length - 1];
      if (last === undefined) home ??= page;
      else last.pages.push(page);
    }
  }
  return { home, groups: groups.filter((group) => group.pages.length > 0) };
}

// Reads every page once; they never change while the app runs.
export async function loadTutorials(dir: string): Promise<TutorialBook> {
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new TutorialsMissing(
        "This copy of Slopify has no tutorials: its docs/wiki folder is missing. Reinstall Slopify (or run npm run build) and reload the page.",
      );
    throw error;
  }
  const pages = new Map<string, string>();
  for (const name of names.sort()) {
    const id = name.replace(/\.md$/, "");
    if (!name.endsWith(".md") || !tutorialPageIdPattern.test(id)) continue;
    pages.set(id, await readFile(join(dir, name), "utf8"));
  }
  if (!pages.has("Home"))
    throw new TutorialsMissing(
      "This copy of Slopify has damaged tutorials: docs/wiki/Home.md is missing. Reinstall Slopify (or run npm run build) and reload the page.",
    );
  const extra = async (name: string) =>
    readFile(join(dir, name), "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
  const sidebar = parseSidebar(await extra("_Sidebar.md"));
  const groups = sidebar.groups
    .map((group) => ({ ...group, pages: group.pages.filter((page) => pages.has(page.id)) }))
    .filter((group) => group.pages.length > 0);
  const listed = new Map<string, TutorialPageSummary>();
  const home = sidebar.home ?? { id: "Home", title: "Home" };
  listed.set(home.id, home);
  for (const group of groups) for (const page of group.pages) listed.set(page.id, page);
  for (const id of pages.keys())
    if (!listed.has(id)) listed.set(id, { id, title: pageTitleOf(id) });
  return {
    index: {
      home,
      groups,
      pages: [...listed.values()],
      footer: (await extra("_Footer.md")).trim(),
    },
    pages,
  };
}

// Plain words of a Markdown line: links become their text, marks and tables' pipes go.
function plain(markdown: string): string {
  return markdown
    .replace(/^\s*\|?\s*:?-{3,}[-|: ]*$/gm, "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>|]/g, " ")
    .replace(/^\s*(?:[-+]|\d+\.)\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface Section {
  readonly anchor: string;
  readonly heading: string | undefined;
  readonly text: string;
}

function sectionsOf(markdown: string): readonly Section[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const headings = tutorialHeadings(markdown);
  const sections: Section[] = [];
  const first = headings[0]?.line ?? lines.length;
  sections.push({ anchor: "", heading: undefined, text: plain(lines.slice(0, first).join("\n")) });
  for (const [at, heading] of headings.entries()) {
    const end = headings[at + 1]?.line ?? lines.length;
    sections.push({
      anchor: heading.anchor,
      heading: heading.text,
      text: plain(lines.slice(heading.line + 1, end).join("\n")),
    });
  }
  return sections.filter((section) => section.heading !== undefined || section.text !== "");
}

function snippetOf(text: string, term: string): string {
  const at = term === "" ? -1 : text.toLowerCase().indexOf(term);
  if (at < 0) return text.length > 180 ? `${text.slice(0, 177).trimEnd()}…` : text;
  // Whole words at both ends.
  const from = Math.max(0, at - 60);
  const start = from === 0 ? 0 : text.indexOf(" ", from) + 1 || from;
  const to = Math.min(text.length, at + term.length + 120);
  const end =
    to === text.length ? to : text.lastIndexOf(" ", to) > at ? text.lastIndexOf(" ", to) : to;
  return `${start > 0 ? "…" : ""}${text.slice(start, end).trim()}${end < text.length ? "…" : ""}`;
}

// The sections that hold every word typed, best first: a word in the page's title or the
// section's heading counts more than one in its text. The first heading (the page's own
// title) stands for the page.
export function searchTutorials(book: TutorialBook, query: string, limit = 30): TutorialHit[] {
  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return [];
  const titles = new Map(book.index.pages.map((page) => [page.id, page.title]));
  const scored: { hit: TutorialHit; score: number; order: number }[] = [];
  let order = 0;
  for (const summary of book.index.pages) {
    const markdown = book.pages.get(summary.id);
    if (markdown === undefined) continue;
    const pageTitle = titles.get(summary.id) ?? pageTitleOf(summary.id);
    for (const section of sectionsOf(markdown)) {
      order += 1;
      const heading = (section.heading ?? "").toLowerCase();
      const text = section.text.toLowerCase();
      const title = pageTitle.toLowerCase();
      let score = 0;
      let all = true;
      let own = false;
      for (const term of terms) {
        const inHeading = heading.includes(term);
        const inTitle = title.includes(term);
        const inText = text.includes(term);
        if (!inHeading && !inText && !inTitle) {
          all = false;
          break;
        }
        own ||= inHeading || inText;
        score += (inHeading ? 6 : 0) + (inTitle ? 3 : 0) + (inText ? 1 : 0);
      }
      // A word only in the page's title would list every section of the page.
      if (!all || !own) continue;
      if (heading === query.trim().toLowerCase()) score += 10;
      scored.push({
        hit: {
          page: summary.id,
          pageTitle,
          anchor: section.anchor,
          heading: section.heading,
          snippet: snippetOf(section.text, terms.find((term) => text.includes(term)) ?? ""),
        },
        score,
        order,
      });
    }
  }
  return scored
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, limit)
    .map(({ hit }) => hit);
}
