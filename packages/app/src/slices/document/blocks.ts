import { remark } from "remark";
import remarkGfm from "remark-gfm";

type Root = ReturnType<ReturnType<typeof remark>["parse"]>;
type RootContent = Root["children"][number];
type PhrasingContent = Extract<RootContent, { type: "paragraph" }>["children"][number];

// The article's markdown as the few things a printed page draws: headings, paragraphs with
// bold, italic and linked words, list items and quotes. remark has already undone the
// markdown's escapes and entities, so the text here is what a reader should see.

export interface Run {
  readonly text: string;
  readonly strong: boolean;
  readonly emphasis: boolean;
  readonly href: string | null;
}

export type Block =
  | { readonly kind: "heading"; readonly level: 1 | 2 | 3; readonly text: string }
  | { readonly kind: "paragraph"; readonly runs: readonly Run[] }
  // Lists are flattened: depth 0 is the outer list, and an item's second paragraph has an
  // empty marker so it lines up under the first.
  | {
      readonly kind: "item";
      readonly depth: number;
      readonly marker: string;
      readonly runs: readonly Run[];
    }
  | { readonly kind: "quote"; readonly runs: readonly Run[] }
  | { readonly kind: "rule" };

interface Style {
  readonly strong: boolean;
  readonly emphasis: boolean;
  readonly href: string | null;
}

const plainStyle: Style = { strong: false, emphasis: false, href: null };

export function markdownBlocks(markdown: string): readonly Block[] {
  const tree = remark().use(remarkGfm).parse(markdown);
  return tree.children.flatMap((node) => blocksOf(node, 0));
}

export function runsText(runs: readonly Run[]): string {
  return runs.map((run) => run.text).join("");
}

// Every link in the markdown, bare URLs included (remark-gfm makes those links too).
export function markdownLinks(
  markdown: string,
): readonly { readonly text: string; readonly href: string }[] {
  const links: { text: string; href: string }[] = [];
  const visit = (node: Root | RootContent): void => {
    if (node.type === "link") {
      const text = collapse(
        inlineRuns(node.children, plainStyle)
          .map((run) => run.text)
          .join(""),
      );
      links.push({ text: text === "" ? node.url : text, href: node.url });
      return;
    }
    if ("children" in node) for (const child of node.children) visit(child);
  };
  visit(remark().use(remarkGfm).parse(markdown));
  return links;
}

function blocksOf(node: RootContent, depth: number): readonly Block[] {
  switch (node.type) {
    case "heading": {
      const text = collapse(runsText(inlineRuns(node.children, plainStyle)));
      return text === ""
        ? []
        : [{ kind: "heading", level: node.depth === 1 ? 1 : node.depth === 2 ? 2 : 3, text }];
    }
    case "paragraph":
      return paragraph(inlineRuns(node.children, plainStyle));
    case "list":
      return node.children.flatMap((item, index) => {
        const marker = node.ordered ? `${(node.start ?? 1) + index}.` : "•";
        let first = true;
        return item.children.flatMap((child): readonly Block[] => {
          if (child.type === "list") return blocksOf(child, depth + 1);
          const runs =
            child.type === "paragraph"
              ? inlineRuns(child.children, plainStyle)
              : blocksOf(child, depth).flatMap((block) => ("runs" in block ? block.runs : []));
          if (tidy(runs).length === 0) return [];
          const block: Block = {
            kind: "item",
            depth,
            marker: first ? marker : "",
            runs: tidy(runs),
          };
          first = false;
          return [block];
        });
      });
    case "blockquote":
      return node.children.flatMap((child) =>
        blocksOf(child, depth).flatMap((block): readonly Block[] =>
          "runs" in block ? [{ kind: "quote", runs: block.runs }] : [block],
        ),
      );
    case "thematicBreak":
      return [{ kind: "rule" }];
    case "code":
      return paragraph([{ ...plainStyle, text: node.value }]);
    case "table":
      return node.children.flatMap((row) =>
        paragraph(
          row.children.flatMap((cell, index) => [
            ...(index === 0 ? [] : [{ ...plainStyle, text: " | " }]),
            ...inlineRuns(cell.children, plainStyle),
          ]),
        ),
      );
    // Raw HTML, footnote definitions, front matter and images have no printed form here.
    default:
      return [];
  }
}

function paragraph(runs: readonly Run[]): readonly Block[] {
  const tidied = tidy(runs);
  return tidied.length === 0 ? [] : [{ kind: "paragraph", runs: tidied }];
}

function inlineRuns(nodes: readonly PhrasingContent[], style: Style): readonly Run[] {
  return nodes.flatMap((node): readonly Run[] => {
    switch (node.type) {
      case "text":
      case "inlineCode":
        return [{ ...style, text: node.value }];
      case "strong":
        return inlineRuns(node.children, { ...style, strong: true });
      case "emphasis":
        return inlineRuns(node.children, { ...style, emphasis: true });
      case "delete":
        return inlineRuns(node.children, style);
      case "link":
        return inlineRuns(node.children, { ...style, href: node.url });
      case "break":
        return [{ ...style, text: "\n" }];
      case "footnoteReference":
        return [{ ...style, text: `[${node.label ?? node.identifier}]` }];
      case "image":
        return node.alt ? [{ ...style, text: node.alt }] : [];
      default:
        return [];
    }
  });
}

// Soft line breaks and runs of spaces become one space; a hard break stays a line break.
function tidy(runs: readonly Run[]): readonly Run[] {
  const tidied = runs
    .map((run) => (run.text === "\n" ? run : { ...run, text: run.text.replace(/\s+/g, " ") }))
    .filter((run) => run.text !== "");
  const first = tidied[0];
  const last = tidied.at(-1);
  if (first === undefined || last === undefined) return [];
  const trimmed = tidied.map((run, index) => ({
    ...run,
    text:
      index === 0 && index === tidied.length - 1
        ? run.text.trim()
        : index === 0
          ? run.text.trimStart()
          : index === tidied.length - 1
            ? run.text.trimEnd()
            : run.text,
  }));
  return trimmed.filter((run) => run.text !== "");
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}
