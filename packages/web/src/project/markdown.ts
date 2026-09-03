// Enough markdown to read an article back: its heading levels, its paragraphs, and bold
// runs inside them. `logic/07` writes the article as markdown and the page has to show it
// as prose rather than as source.
//
// ceiling: headings, paragraphs and bold. Lists, links, images, code fences and tables
// come through as their own source text, which is legible but not typeset. The upgrade is
// a real parser in the dependency chapter; nothing in the pipeline asks the model for a
// table today, so one is not carried for this alone.

export interface Span {
  readonly text: string;
  readonly bold: boolean;
}

export type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly spans: readonly Span[] }
  | { readonly kind: "paragraph"; readonly spans: readonly Span[] };

const blank = /\r?\n[ \t]*(?:\r?\n[ \t]*)+/;
const heading = /^(#{1,6})\s+(.*)$/;

export function blocksOf(markdown: string): readonly Block[] {
  return markdown
    .trim()
    .split(blank)
    .flatMap((chunk) => {
      const text = chunk.trim();
      return text === "" ? [] : [blockOf(text)];
    });
}

export interface Split {
  // The article's own title, for the heading beside its sources and glossary links. An
  // article that opens with something other than a heading has none, and the caller falls
  // back to the project's title.
  readonly title: string | undefined;
  // Everything after it, so the title is not typeset twice.
  readonly body: readonly Block[];
}

export function splitTitle(markdown: string): Split {
  const blocks = blocksOf(markdown);
  const first = blocks[0];
  if (first === undefined || first.kind !== "heading") {
    return { title: undefined, body: blocks };
  }
  return { title: first.spans.map((span) => span.text).join(""), body: blocks.slice(1) };
}

function blockOf(text: string): Block {
  const [first = "", ...rest] = text.split(/\r?\n/);
  const marked = heading.exec(first);
  if (marked !== null && rest.length === 0) {
    // Six levels of markdown collapse onto the three sizes the type scale has
    // (uiux/02-system.md, Typography).
    const level = Math.min(3, (marked[1] ?? "#").length) as 1 | 2 | 3;
    return { kind: "heading", level, spans: spansOf(marked[2] ?? "") };
  }
  // A wrapped paragraph is one paragraph: the line breaks inside it are the model's
  // wrapping, not the author's.
  return { kind: "paragraph", spans: spansOf(text.split(/\r?\n/).join(" ")) };
}

// `**bold**` runs, and nothing else. An unclosed marker stays as the text it is.
export function spansOf(text: string): readonly Span[] {
  const spans: Span[] = [];
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("**", at);
    if (open === -1) {
      push(spans, text.slice(at), false);
      break;
    }
    const close = text.indexOf("**", open + 2);
    if (close === -1) {
      push(spans, text.slice(at), false);
      break;
    }
    push(spans, text.slice(at, open), false);
    push(spans, text.slice(open + 2, close), true);
    at = close + 2;
  }
  return spans.length === 0 ? [{ text: "", bold: false }] : spans;
}

function push(spans: Span[], text: string, bold: boolean): void {
  if (text !== "") {
    spans.push({ text, bold });
  }
}
