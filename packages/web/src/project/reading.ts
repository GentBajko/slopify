// The pure part of the reading view (`reading-view.tsx`): the headings a markdown text holds,
// the Markdown of each section for "Copy section", and the rehype pass that gives the rendered
// headings their anchors and marks search hits.

export interface ReadingHeading {
  readonly level: number;
  // Plain text, for the table of contents.
  readonly text: string;
  // The heading's own Markdown section: its line up to the next heading of any level.
  readonly markdown: string;
}

const atx = /^ {0,3}(#{1,6})[ \t]+(.*?)[ \t]*#*[ \t]*$/u;
const fence = /^ {0,3}(`{3,}|~{3,})/u;
const setext = /^ {0,3}(=+|-+)[ \t]*$/u;

// Reads the headings the way the renderer finds them, in the same order: ATX headings and
// setext ones (a text line underlined with === or ---), never inside a fenced code block.
export function readingHeadings(markdown: string): readonly ReadingHeading[] {
  const lines = markdown.replace(/\r\n?/gu, "\n").split("\n");
  const starts: { line: number; level: number; text: string }[] = [];
  let fenced: string | undefined;
  for (const [index, line] of lines.entries()) {
    const opener = fence.exec(line)?.[1];
    if (opener !== undefined) {
      if (fenced === undefined) fenced = opener[0];
      else if (opener[0] === fenced) fenced = undefined;
      continue;
    }
    if (fenced !== undefined) continue;
    const heading = atx.exec(line);
    if (heading !== null) {
      starts.push({ line: index, level: heading[1]?.length ?? 1, text: plain(heading[2] ?? "") });
      continue;
    }
    const underline = setext.exec(line);
    const previous = lines[index - 1];
    if (
      underline !== null &&
      previous !== undefined &&
      previous.trim() !== "" &&
      !atx.test(previous) &&
      !/^ {0,3}([-*+]|\d+[.)])\s/u.test(previous) &&
      (index < 2 || (lines[index - 2] ?? "").trim() === "")
    ) {
      // The underlined line was read as text; it is the heading.
      starts.push({
        line: index - 1,
        level: underline[1]?.startsWith("=") ? 1 : 2,
        text: plain(previous),
      });
    }
  }
  return starts.map((start, at) => ({
    level: start.level,
    text: start.text,
    markdown: lines
      .slice(start.line, starts[at + 1]?.line ?? lines.length)
      .join("\n")
      .trim(),
  }));
}

// A heading's words without the Markdown around them: emphasis, code and link syntax.
function plain(text: string): string {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, "$1")
    .replace(/[*_`~]/gu, "")
    .trim();
}

// Every place `query` appears in `text`, without regard to case.
export function hitRanges(text: string, query: string): readonly [number, number][] {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [];
  const haystack = text.toLowerCase();
  const ranges: [number, number][] = [];
  let at = haystack.indexOf(needle);
  while (at !== -1) {
    ranges.push([at, at + needle.length]);
    at = haystack.indexOf(needle, at + needle.length);
  }
  return ranges;
}

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

// A rehype plugin: numbers the headings `${idPrefix}-h1`, `-h2` … in document order so the
// table of contents can reach them, and wraps each search hit in `<mark data-hit>`.
export function rehypeReading(options: { readonly idPrefix: string; readonly query: string }) {
  return () =>
    (tree: HastNode): void => {
      let heading = 0;
      const walk = (node: HastNode): void => {
        const children = node.children;
        if (children === undefined) return;
        const next: HastNode[] = [];
        for (const child of children) {
          if (child.type === "element" && /^h[1-6]$/u.test(child.tagName ?? "")) {
            heading += 1;
            child.properties = {
              ...child.properties,
              id: `${options.idPrefix}-h${String(heading)}`,
            };
          }
          if (child.type === "text" && child.value !== undefined) {
            next.push(...marked(child.value, options.query));
            continue;
          }
          walk(child);
          next.push(child);
        }
        node.children = next;
      };
      walk(tree);
    };
}

function marked(value: string, query: string): HastNode[] {
  const ranges = hitRanges(value, query);
  if (ranges.length === 0) return [{ type: "text", value }];
  const nodes: HastNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) nodes.push({ type: "text", value: value.slice(at, start) });
    nodes.push({
      type: "element",
      tagName: "mark",
      properties: { dataHit: "" },
      children: [{ type: "text", value: value.slice(start, end) }],
    });
    at = end;
  }
  if (at < value.length) nodes.push({ type: "text", value: value.slice(at) });
  return nodes;
}
